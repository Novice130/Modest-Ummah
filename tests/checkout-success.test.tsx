import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock('@/components/checkout/clear-cart-on-success', () => ({
  default: ({ paymentRef }: { paymentRef: string }) => {
    h.clear(paymentRef);
    return null;
  },
}));

import Page from '@/app/checkout/success/page';

const render = async (params: Record<string, any>) => {
  h.clear.mockClear();
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
};

describe('checkout result page', () => {
  it('succeeded: confirms and clears the cart', async () => {
    const html = await render({ redirect_status: 'succeeded', payment_intent: 'pi_1' });
    expect(html).toContain('Order Confirmed');
    expect(h.clear).toHaveBeenCalledWith('pi_1');
  });

  it('processing: says so and keeps the cart', async () => {
    const html = await render({ redirect_status: 'processing', payment_intent: 'pi_1' });
    expect(html).toContain('Payment Processing');
    expect(html).not.toContain('Order Confirmed');
    expect(h.clear).not.toHaveBeenCalled();
  });

  it('failed: offers a retry and keeps the cart', async () => {
    const html = await render({ redirect_status: 'requires_payment_method', payment_intent: 'pi_1' });
    expect(html).toContain('Payment Failed');
    expect(html).toContain('href="/checkout"');
    expect(html).not.toContain('Order Confirmed');
    expect(h.clear).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ redirect_status: 'nonsense' }], [{ redirect_status: 'succeeded' }]])(
    'unknown or incomplete %j: confirms nothing and keeps the cart',
    async (params) => {
      const html = await render(params);
      expect(html).not.toContain('Order Confirmed');
      expect(h.clear).not.toHaveBeenCalled();
    }
  );
});
