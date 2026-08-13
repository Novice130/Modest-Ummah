import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Returns & Exchanges',
  description: 'The Modest Ummah 30-day return and exchange policy.',
};

const steps = [
  {
    title: '1. Contact us within 30 days',
    body: 'Email support@modestummah.com with your order number and the item(s) you would like to return.',
  },
  {
    title: '2. Prepare your item',
    body: 'Items must be unworn, unwashed, and in their original condition with tags attached.',
  },
  {
    title: '3. Ship it back',
    body: 'We will reply with a return address. You are responsible for return shipping unless the item arrived damaged or incorrect.',
  },
  {
    title: '4. Refund',
    body: 'Refunds are issued to your original payment method within 5-10 business days of receiving the return.',
  },
];

export default function ReturnsPage() {
  return (
    <div className="container-custom py-16 max-w-3xl">
      <h1 className="font-heading text-3xl md:text-4xl mb-4">Returns & Exchanges</h1>
      <p className="text-muted-foreground mb-8">
        We want you to love your order. If something is not right, here is how returns work.
      </p>

      <div className="space-y-4 mb-10">
        {steps.map((step) => (
          <div key={step.title} className="border rounded-lg p-5 bg-card">
            <h2 className="font-heading font-semibold mb-2">{step.title}</h2>
            <p className="text-sm text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="font-heading text-xl mb-3">Non-returnable items</h2>
          <p className="text-muted-foreground">
            For hygiene reasons, opened personal-care items (miswak, attar) and worn garments
            cannot be returned. Items marked final sale are also non-returnable.
          </p>
        </section>
        <section>
          <h2 className="font-heading text-xl mb-3">Damaged or incorrect items</h2>
          <p className="text-muted-foreground">
            If your order arrived damaged or wrong, we cover the return shipping and will
            ship a replacement or issue a full refund — your choice.
          </p>
        </section>
        <section>
          <h2 className="font-heading text-xl mb-3">Questions?</h2>
          <p className="text-muted-foreground">
            Email{' '}
            <a href="mailto:support@modestummah.com" className="text-sage-600 hover:underline">
              support@modestummah.com
            </a>{' '}
            or see our{' '}
            <Link href="/shipping" className="text-sage-600 hover:underline">shipping page</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
