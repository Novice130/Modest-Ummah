'use client';

import { CreditCard, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PaymentMethodsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Payment Methods</h1>
          <p className="text-muted-foreground">Manage your saved payment methods</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add New Card
        </Button>
      </div>

      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <CreditCard className="h-8 w-8" />
          </div>
          <p>No saved payment methods found.</p>
          <p className="text-sm mt-1">Payment methods are saved securely by Stripe.</p>
        </CardContent>
      </Card>
    </div>
  );
}
