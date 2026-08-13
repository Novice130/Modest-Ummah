import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Modest Ummah collects, uses, and protects your information.',
};

export default function PrivacyPage() {
  return (
    <div className="container-custom py-16 max-w-3xl">
      <h1 className="font-heading text-3xl md:text-4xl mb-8">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Last updated: August 2026
      </p>

      <div className="prose prose-sm max-w-none space-y-6">
        <section>
          <h2 className="font-heading text-xl mb-3">What we collect</h2>
          <p className="text-muted-foreground">
            When you place an order, create an account, or subscribe to our newsletter, we
            collect the information you give us: your name, email address, shipping address,
            and phone number. Payment details are handled by our payment processor (Stripe)
            and never touch our servers.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">How we use it</h2>
          <p className="text-muted-foreground">
            We use your information to process and deliver orders, respond to support
            requests, send order updates, and — only if you opt in — send newsletters and
            promotions. We do not sell or rent your personal information to anyone.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Cookies</h2>
          <p className="text-muted-foreground">
            We use essential cookies to keep you signed in and to remember your cart.
            Our theme preference is stored on your device. We do not use advertising
            trackers.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Your rights</h2>
          <p className="text-muted-foreground">
            You can request a copy of your data, ask us to correct it, or ask us to delete
            your account and personal information at any time by contacting us at{' '}
            <a href="mailto:support@modestummah.com" className="text-sage-600 hover:underline">
              support@modestummah.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Data retention</h2>
          <p className="text-muted-foreground">
            Order records are kept for accounting and legal purposes. Newsletter
            subscriptions are kept until you unsubscribe. Accounts you delete are removed
            from our database.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Contact</h2>
          <p className="text-muted-foreground">
            Questions about this policy? Email{' '}
            <a href="mailto:support@modestummah.com" className="text-sage-600 hover:underline">
              support@modestummah.com
            </a>{' '}
            or visit our <Link href="/contact" className="text-sage-600 hover:underline">contact page</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
