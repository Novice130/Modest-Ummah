import Link from 'next/link';
import { CheckCircle, Package, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12">
      <Card className="max-w-lg w-full mx-4">
        <CardContent className="pt-8 text-center">
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

          <p className="text-xs text-muted-foreground mt-6">
            Questions? Contact us at{' '}
            <a href="mailto:support@modestummah.com" className="text-sage-600 hover:underline">
              support@modestummah.com
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
