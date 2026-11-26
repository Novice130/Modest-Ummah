import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Shipping Info',
  description: 'Shipping rates, delivery times, and order tracking at Modest Ummah.',
};

const rows = [
  { region: 'United States (standard)', time: '5-10 business days', cost: '$9.99 — free on orders $75+ after discounts' },
  { region: 'United States (express)', time: '2-4 business days', cost: '$14.99' },
  { region: 'International (outside the US)', time: 'By email quote', cost: 'Email support@modestummah.com' },
];

export default function ShippingPage() {
  return (
    <div className="container-custom py-16 max-w-3xl">
      <h1 className="font-heading text-3xl md:text-4xl mb-4">Shipping Info</h1>
      <p className="text-muted-foreground mb-8">
        Everything you need to know about United States shipping rates, delivery estimates, and international orders.
      </p>

      <div className="border rounded-lg overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Region</th>
              <th className="text-left px-4 py-3 font-medium">Delivery time</th>
              <th className="text-left px-4 py-3 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.region} className="border-b last:border-b-0">
                <td className="px-4 py-3">{row.region}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.time}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="font-heading text-xl mb-3">Free shipping</h2>
          <p className="text-muted-foreground">
            Orders of $75 or more after discounts ship free via standard shipping within the
            United States. Free shipping is applied automatically at checkout.
          </p>
        </section>
        <section>
          <h2 className="font-heading text-xl mb-3">Tracking your order</h2>
          <p className="text-muted-foreground">
            You will receive a tracking number by email as soon as your order ships. You can
            also see tracking details in your{' '}
            <Link href="/account/orders" className="text-sage-600 hover:underline">
              order history
            </Link>
            .
          </p>
        </section>
        <section>
          <h2 className="font-heading text-xl mb-3">International orders &amp; customs</h2>
          <p className="text-muted-foreground">
            Checkout currently supports shipping within the United States only. For an
            international order, please email{' '}
            <a href="mailto:support@modestummah.com" className="text-sage-600 hover:underline">
              support@modestummah.com
            </a>{' '}
            with your items and destination for a custom shipping quote. International
            recipients are responsible for any import duties and taxes.
          </p>
        </section>
        <section>
          <h2 className="font-heading text-xl mb-3">Questions?</h2>
          <p className="text-muted-foreground">
            Email{' '}
            <a href="mailto:support@modestummah.com" className="text-sage-600 hover:underline">
              support@modestummah.com
            </a>{' '}
            — we are happy to help.
          </p>
        </section>
      </div>
    </div>
  );
}
