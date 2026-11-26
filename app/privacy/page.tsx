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
        Last updated: November 2026
      </p>

      <div className="prose prose-sm max-w-none space-y-6">
        <section>
          <h2 className="font-heading text-xl mb-3">What we collect</h2>
          <p className="text-muted-foreground">
            When you place an order, create an account, contact us, or subscribe to our
            newsletter, we collect the information you give us: your name, email address,
            shipping and billing addresses, phone number, order details, and any message you
            send us. If you sign in with Google or Apple, we receive your name, email address,
            and an account identifier from them. Payment details are handled by our payment
            processor (Stripe) and never touch our servers.
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
          <h2 className="font-heading text-xl mb-3">Service providers</h2>
          <p className="text-muted-foreground mb-3">
            These companies handle information for us as part of running the store:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Stripe: payment processing.</li>
            <li>Brevo: sending order, shipping, and account emails.</li>
            <li>Google and Apple: sign-in, if you choose to use them.</li>
            <li>
              Pirate Ship and the delivery carrier: order and address details, to buy shipping
              labels and deliver your order.
            </li>
            <li>TaxCloud: delivery address and cart items, to calculate sales tax, when enabled.</li>
            <li>
              Sentry: error monitoring, set up not to send user details, cookies, request
              contents, or query strings.
            </li>
            <li>Cloudflare: website delivery and security.</li>
            <li>Hetzner: website hosting.</li>
            <li>Neon: database hosting.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Cookies</h2>
          <p className="text-muted-foreground">
            We use an essential cookie to keep you signed in. Your cart, wishlist, and theme
            preference are stored on your device. Stripe, Google, and Apple load their own
            scripts on checkout and sign-in pages and may set their own cookies. We do not use
            advertising trackers.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Your rights</h2>
          <p className="text-muted-foreground">
            You can request a copy of your data, ask us to correct it, or ask us to delete
            your account at any time by contacting us at{' '}
            <a href="mailto:support@modestummah.com" className="text-sage-600 hover:underline">
              support@modestummah.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">Data retention</h2>
          <p className="text-muted-foreground">
            Order records are kept for accounting and legal purposes. When an account is
            deleted, the account and its saved cart are removed and the email address on its
            orders is replaced, but the orders themselves are kept, including the name, phone
            number, and shipping and billing addresses on them. Newsletter sign-ups are kept
            until you ask us to remove them.
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
