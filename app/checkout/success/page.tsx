import Link from 'next/link';
import { AlertCircle, ArrowRight, CheckCircle, Clock, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PaymentSucceededTracker } from '@/components/analytics/payment-succeeded-tracker';
import ClearCartOnSuccess from '@/components/checkout/clear-cart-on-success';

type SearchParams = { [key: string]: string | string[] | undefined };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function SupportLine() {
  return (
    <p className="text-xs text-muted-foreground mt-6">
      Questions? Contact us at{' '}
      <a href="mailto:support@modestummah.com" className="text-sage-600 hover:underline">
        support@modestummah.com
      </a>
    </p>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12">
      <Card className="max-w-lg w-full mx-4">
        <CardContent className="pt-8 text-center">
          {children}
          <SupportLine />
        </CardContent>
      </Card>
    </div>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
        {icon}
      </div>
      <h1 className="font-heading text-2xl md:text-3xl mb-2">{title}</h1>
      <p className="text-muted-foreground mb-6">{children}</p>
    </>
  );
}

/**
 * Stripe redirects here with redirect_status and payment_intent. The parameter
 * only decides what this page says and whether this browser's cart is emptied;
 * the order itself moves on the signed webhook, never on this URL.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const status = first(params.redirect_status);
  const paymentRef = first(params.payment_intent);

  if (status === 'succeeded' && paymentRef) {
    return (
      <Shell>
        <PaymentSucceededTracker />
        <ClearCartOnSuccess paymentRef={paymentRef} />
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>

        <h1 className="font-heading text-2xl md:text-3xl mb-2">Order Confirmed!</h1>
        <p className="text-muted-foreground mb-6">
          Thank you for your purchase. We&apos;ve received your order and will send you an email confirmation shortly.
        </p>

        <div className="bg-muted/50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center gap-2 text-sm">
            <Package className="h-5 w-5 text-sage-600" />
            <span>Estimated delivery: 5-10 business days</span>
          </div>
        </div>

        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/account/orders">
              View Order Details
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/shop">Continue Shopping</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (status === 'processing') {
    return (
      <Shell>
        <Notice icon={<Clock className="w-8 h-8 text-amber-600" />} title="Payment Processing">
          Your bank is still processing this payment. We&apos;ll email you as soon as it is confirmed. There is no need to pay again.
        </Notice>
        <Button asChild variant="outline" className="w-full">
          <Link href="/shop">Continue Shopping</Link>
        </Button>
      </Shell>
    );
  }

  if (status === 'requires_payment_method' || status === 'failed') {
    return (
      <Shell>
        <Notice icon={<AlertCircle className="w-8 h-8 text-red-600" />} title="Payment Failed">
          Your payment did not go through and you have not been charged. Your cart is saved, so you can try again with another payment method.
        </Notice>
        <Button asChild className="w-full">
          <Link href="/checkout">Return to Checkout</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <Notice icon={<AlertCircle className="w-8 h-8 text-muted-foreground" />} title="We Couldn't Confirm a Payment">
        We don&apos;t have a payment result to show here. If you completed a payment, a confirmation email is on its way and the order will appear in your account.
      </Notice>
      <div className="space-y-3">
        <Button asChild className="w-full">
          <Link href="/account/orders">View Your Orders</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/checkout">Return to Checkout</Link>
        </Button>
      </div>
    </Shell>
  );
}
