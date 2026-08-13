import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of modestummah.com.',
};

export default function TermsPage() {
  return (
    <div className="container-custom py-16 max-w-3xl">
      <h1 className="font-heading text-3xl md:text-4xl mb-8">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Last updated: August 2026
      </p>

      <div className="prose prose-sm max-w-none space-y-6">
        <section>
          <h2 className="font-heading text-xl mb-3">Using our store</h2>
          <p className="text-muted-foreground">
            By placing an order with Modest Ummah, you agree to provide accurate shipping
            and contact information, and you confirm that you are authorized to use the
            payment method you select.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Orders and payment</h2>
          <p className="text-muted-foreground">
            All prices are listed in US dollars. We reserve the right to cancel orders in
            the event of pricing errors, suspected fraud, or unavailability of stock. If we
            cancel your order, you will receive a full refund to your original payment
            method.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Shipping</h2>
          <p className="text-muted-foreground">
            Estimated delivery times are provided at checkout and are not guaranteed.
            International customers are responsible for any customs duties or import taxes.
            See our <Link href="/shipping" className="text-sage-600 hover:underline">shipping page</Link>{' '}
            for details.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Returns</h2>
          <p className="text-muted-foreground">
            Unworn items in their original condition may be returned within 30 days of
            delivery. See our{' '}
            <Link href="/returns" className="text-sage-600 hover:underline">returns page</Link> for
            the full policy and process.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Intellectual property</h2>
          <p className="text-muted-foreground">
            All content on this site — text, images, and design — is the property of Modest
            Ummah and may not be reproduced without written permission.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Limitation of liability</h2>
          <p className="text-muted-foreground">
            To the maximum extent permitted by law, Modest Ummah is not liable for indirect
            or consequential damages arising from the use of this site or products purchased
            through it. Our total liability for any claim is limited to the amount you paid
            for the relevant order.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Contact</h2>
          <p className="text-muted-foreground">
            Questions about these terms? Email{' '}
            <a href="mailto:support@modestummah.com" className="text-sage-600 hover:underline">
              support@modestummah.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
