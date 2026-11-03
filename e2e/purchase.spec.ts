/**
 * End-to-end purchase: browse to a product, add it to the bag, pay with a Stripe
 * test card, then find the order in admin.
 *
 * TARGET: staging only, with Stripe in test mode. Not yet part of CI, and it has
 * never been run against a site, so expect selector fixes on the first real run.
 *
 *   E2E_BASE_URL=https://<staging> E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
 *   (first time on a machine: npx playwright install chromium)
 *
 * Production safeguards:
 *   - playwright.config.ts and this file refuse modestummah.com / www.modestummah.com.
 *   - Every browser request to those hosts is aborted, so a redirect cannot reach them.
 *   - Before "Pay Now", the page must have used a pk_test_ key and no pk_live_ key,
 *     which also catches a staging URL that is really running live Stripe keys.
 *
 * Each run leaves one paid test order on the target. The site needs a working
 * Stripe webhook: orders stay in the admin "Awaiting payment" tab until it fires.
 */
import { expect, test, type Page } from '@playwright/test';
import { assertNotProduction, isProductionUrl } from './guard';

const TEST_CARD = { number: '4242424242424242', expiry: '12/34', cvc: '123', postalCode: '60601' };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set. See the header of e2e/purchase.spec.ts.`);
  return value;
}

/** Opens products from /shop until one can be bought, and leaves the page on it. */
async function openInStockProduct(page: Page) {
  await page.goto('/shop');
  const links = page.locator('a[href^="/product/"]');
  await expect(links.first()).toBeVisible({ timeout: 30_000 });
  const hrefs = await links.evaluateAll((els) => [
    ...new Set(els.map((el) => el.getAttribute('href') as string)),
  ]);

  for (const href of hrefs) {
    await page.goto(href);
    const addToBag = page.getByRole('button', { name: 'Add to Bag' });
    await expect(addToBag).toBeVisible();
    if (await addToBag.isEnabled()) return;
  }
  throw new Error(`None of the ${hrefs.length} products on /shop is in stock.`);
}

async function payWithTestCard(page: Page) {
  const stripe = page.locator('iframe[title="Secure payment input frame"]').first().contentFrame();
  const number = stripe.locator('input[name="number"]');
  // With several payment methods enabled, Stripe hides the card fields behind a tab.
  const cardOption = stripe
    .getByRole('tab', { name: /card/i })
    .or(stripe.getByRole('button', { name: /^card$/i }));
  await expect(number.or(cardOption).first()).toBeVisible({ timeout: 60_000 });
  if (!(await number.isVisible())) await cardOption.first().click();

  await number.fill(TEST_CARD.number);
  await stripe.locator('input[name="expiry"]').fill(TEST_CARD.expiry);
  await stripe.locator('input[name="cvc"]').fill(TEST_CARD.cvc);
  const postalCode = stripe.locator('input[name="postalCode"]');
  if (await postalCode.isVisible()) await postalCode.fill(TEST_CARD.postalCode);
}

test('buy a product with a test card and see the order in admin', async ({ page, context, baseURL }) => {
  assertNotProduction(requireEnv('E2E_BASE_URL'));
  const adminEmail = requireEnv('E2E_ADMIN_EMAIL');
  const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
  expect(baseURL).toBeTruthy();

  await context.route(
    (url) => isProductionUrl(url),
    (route) => route.abort('blockedbyclient')
  );

  const stripeKeys = { test: false, live: false };
  context.on('request', (request) => {
    const sent = `${request.url()} ${request.postData() ?? ''}`;
    if (sent.includes('pk_test_')) stripeKeys.test = true;
    if (sent.includes('pk_live_')) stripeKeys.live = true;
  });

  // example.com takes no mail, and the unique address is how admin finds this order.
  const customerEmail = `e2e-${Date.now()}@example.com`;

  await test.step('browse to a product and add it to the bag', async () => {
    await openInStockProduct(page);

    // Products with sizes refuse to add until one is chosen.
    const sizes = page
      .getByText('Size', { exact: true })
      .locator('xpath=../following-sibling::div')
      .getByRole('button');
    if ((await sizes.count()) > 0) await sizes.first().click();

    await page.getByRole('button', { name: 'Add to Bag' }).click();
    await page.getByRole('link', { name: 'Checkout', exact: true }).click();
    await expect(page).toHaveURL(/\/checkout$/);
  });

  await test.step('enter contact and shipping details', async () => {
    await page.getByLabel('Email', { exact: true }).fill(customerEmail);
    await page.getByLabel('First Name').fill('E2E');
    await page.getByLabel('Last Name').fill('Tester');
    await page.getByLabel('Address', { exact: true }).fill('100 Main Street');
    await page.getByLabel('City').fill('Chicago');
    await page.getByLabel('State').fill('IL');
    await page.getByLabel('Postal Code').fill(TEST_CARD.postalCode);
    await page.getByLabel('Phone').fill('+13125550100');
    await page.getByRole('button', { name: 'Proceed to Shipping Method' }).click();
  });

  await test.step('accept the preselected shipping method', async () => {
    const proceed = page.getByRole('button', { name: 'Continue to Payment' });
    await expect(proceed).toBeEnabled({ timeout: 30_000 });
    await proceed.click();
  });

  await test.step('pay with the Stripe test card', async () => {
    await payWithTestCard(page);

    expect(stripeKeys.live, 'page used a live Stripe key').toBe(false);
    expect(stripeKeys.test, 'page did not use a Stripe test key').toBe(true);

    await page.getByRole('button', { name: 'Pay Now' }).click();
    await page.waitForURL(/\/checkout\/success/, { timeout: 60_000 });
    // The success page renders the same whatever happened, so check Stripe's verdict.
    expect(new URL(page.url()).searchParams.get('redirect_status')).toBe('succeeded');
    await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeVisible();
  });

  await test.step('find the paid order in admin', async () => {
    await page.goto('/admin/login?redirect=/admin/orders');
    await page.getByLabel('Admin Email').fill(adminEmail);
    await page.getByLabel('Password', { exact: true }).fill(adminPassword);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(/\/admin\/orders/);

    // The "All" tab hides the order until the Stripe webhook marks it paid, so
    // search again until it appears.
    const row = page.getByRole('row').filter({ hasText: customerEmail });
    await expect(async () => {
      await page.reload();
      await page.getByRole('textbox', { name: 'Search orders' }).fill(customerEmail);
      await expect(row).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000 });
    await expect(row.getByText('Paid', { exact: true })).toBeVisible();
  });
});
