import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as Sentry from '@sentry/nextjs';
import {
  escapeHtml,
  sendEmail,
  sendNewOrderAlert,
  sendOrderConfirmation,
  sendPasswordResetEmail,
  sendShippingNotification,
  sendWelcomeEmail,
} from '@/lib/email';

const X = '<script>alert(1)</script>';
const order = {
  orderId: `MU-${X}`,
  email: 'c@example.com',
  customerName: X,
  items: [{ name: X, quantity: 1, price: 5, image: `https://x/"><img src=y onerror=${X}` }],
  subtotal: 5,
  shipping: 0,
  tax: 0,
  total: 5,
  shippingAddress: { street1: X, street2: X, city: X, state: X, zip: X, country: X },
};

const fetchMock = vi.fn();
const sentHtml = () => JSON.parse(fetchMock.mock.calls[0][1].body).htmlContent as string;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('BREVO_API_KEY', 'test-key');
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messageId: 'm' }) });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('escaping', () => {
  it('escapes the HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x" id='y'>&`)).toBe(
      '&lt;a href=&quot;x&quot; id=&#39;y&#39;&gt;&amp;'
    );
  });

  it.each([
    ['order confirmation', () => sendOrderConfirmation(order)],
    ['admin alert', () => sendNewOrderAlert(order, 'admin@example.com')],
    [
      'shipping',
      () =>
        sendShippingNotification({
          email: 'c@e.co',
          customerName: X,
          orderId: X,
          trackingNumber: X,
          carrier: `usps${X}`,
          estimatedDelivery: X,
        }),
    ],
    ['welcome', () => sendWelcomeEmail({ email: 'c@e.co', name: X })],
    ['reset', () => sendPasswordResetEmail({ email: 'c@e.co', name: X, resetLink: `https://x/"${X}` })],
  ])('%s has no live markup from values', async (_n, send) => {
    await send();
    const html = sentHtml();
    expect(html).not.toContain('<script');
    expect(html).not.toContain('"><img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuses a javascript: image or link', async () => {
    await sendOrderConfirmation({
      ...order,
      items: [{ name: 'a', quantity: 1, price: 1, image: 'javascript:alert(1)' }],
    });
    expect(sentHtml()).not.toContain('javascript:');
    fetchMock.mockClear();
    await sendPasswordResetEmail({ email: 'c@e.co', name: 'n', resetLink: 'javascript:alert(1)' });
    expect(sentHtml()).not.toContain('javascript:');
  });

  it('encodes the tracking number in the tracking URL', async () => {
    await sendShippingNotification({
      email: 'c@e.co',
      customerName: 'n',
      orderId: '1',
      trackingNumber: 'a&b c',
      carrier: 'USPS',
    });
    expect(sentHtml()).toContain('tLabels=a%26b%20c');
  });
});

describe('send failures', () => {
  const params = { to: [{ email: 'c@e.co' }], subject: 's', htmlContent: 'h' };

  it('a missing key logs an error in production', async () => {
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');
    const r = await sendEmail(params);
    expect(r.success).toBe(false);
    expect(console.error).toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a missing key only warns in development', async () => {
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'development');
    await sendEmail(params);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('a Brevo rejection returns the failure and never leaks the address to Sentry', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'bad c@e.co' }),
    });
    const r = await sendEmail(params);
    expect(r.success).toBe(false);
    expect(Sentry.captureMessage).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(Sentry.captureMessage).mock.calls)).not.toContain('c@e.co');
  });
});

describe('new order alert', () => {
  it('goes to the given address, with the customer as reply-to', async () => {
    await sendNewOrderAlert({ ...order, orderId: 'MU-9', customerName: 'Sam' }, 'admin@example.com');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: 'admin@example.com' }]);
    expect(body.replyTo).toEqual({ email: 'c@example.com', name: 'Sam' });
    expect(body.subject).toContain('MU-9');
  });
});
