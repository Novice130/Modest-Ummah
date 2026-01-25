'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Loader2, Lock, ChevronLeft, ShoppingBag, Truck, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCartStore, useAuthStore } from '@/lib/store';
import { formatPrice, generateOrderId, getValidImageSrc } from '@/lib/utils';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const checkoutSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  address1: z.string().min(5, 'Address is required'),
  address2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  postalCode: z.string().min(3, 'Postal code is required'),
  country: z.string().min(2, 'Country is required'),
  phone: z.string().min(10, 'Phone number is required'),
  saveInfo: z.union([z.boolean(), z.string()]).optional().transform(val => val === true || val === 'on'),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

interface ShippingRate {
  carrier: string;
  service: string;
  serviceName: string;
  rate: number;
  estimatedDays: number;
}

function PaymentForm({ clientSecret, onSuccess }: { clientSecret: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        console.error('Stripe submit error:', submitError);
        setError(submitError.message || 'An error occurred');
        setIsProcessing(false);
        return;
      }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/success`,
        },
      });

      if (confirmError) {
        console.error('Stripe confirm error:', confirmError);
        setError(confirmError.message || 'Payment failed');
        setIsProcessing(false);
      }
    } catch (err: any) {
      console.error('Unexpected payment error:', err);
      setError(err.message || 'An unexpected error occurred during payment.');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!stripe || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Lock className="h-4 w-4 mr-2" />
            Pay Now
          </>
        )}
      </Button>
    </form>
  );
}

export default function CheckoutForm() {
  const router = useRouter();
  const { items, getSubtotal, clearCart } = useCartStore();
  const { user } = useAuthStore();
  const [step, setStep] = useState<'info' | 'shipping' | 'payment'>('info');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Shipping and tax state
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingRate | null>(null);
  const [tax, setTax] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [addressData, setAddressData] = useState<CheckoutFormData | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      email: user?.email || '',
      country: 'US',
    },
  });

  // API Error state
  const [apiError, setApiError] = useState<string | null>(null);

  const subtotal = getSubtotal();
  const shipping = selectedShipping?.rate || 0;
  const total = subtotal + shipping + tax;

  // Wait for hydration before checking cart
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Only redirect if mounted (hydrated) and cart is truly empty
    if (mounted && items.length === 0) {
      router.push('/cart');
    }
  }, [mounted, items.length, router]);

  // Calculate shipping and tax when address is submitted
  const onSubmitInfo = async (data: CheckoutFormData) => {
    setIsCalculating(true);
    setAddressData(data);
    
    try {
      // Get shipping rates
      const shippingResponse = await fetch('/api/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            weight: 8, // Default weight in ounces
          })),
          shippingAddress: {
            firstName: data.firstName,
            lastName: data.lastName,
            address1: data.address1,
            address2: data.address2,
            city: data.city,
            state: data.state,
            postalCode: data.postalCode,
            country: data.country,
            phone: data.phone,
            email: data.email,
          },
        }),
      });
      
      const shippingData = await shippingResponse.json();
      if (shippingData.success && shippingData.rates.length > 0) {
        setShippingRates(shippingData.rates);
        // Auto-select cheapest or free shipping
        const freeShipping = subtotal >= 75;
        if (freeShipping) {
          const cheapest = shippingData.rates[0];
          setSelectedShipping({ ...cheapest, rate: 0 });
        } else {
          setSelectedShipping(shippingData.rates[0]);
        }
      }

      // Calculate tax
      const taxResponse = await fetch('/api/tax/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({
            productId: item.productId,
            price: item.price,
            quantity: item.quantity,
          })),
          shippingAddress: {
            address1: data.address1,
            address2: data.address2,
            city: data.city,
            state: data.state,
            postalCode: data.postalCode,
          },
        }),
      });

      const taxData = await taxResponse.json();
      if (taxData.success) {
        setTax(taxData.totalTax);
      }

      setStep('shipping');
    } catch (error) {
      console.error('Error calculating shipping/tax:', error);
      // Use fallback values
      setShippingRates([
        { carrier: 'USPS', service: 'standard', serviceName: 'Standard Shipping', rate: subtotal >= 75 ? 0 : 9.99, estimatedDays: 5 },
        { carrier: 'USPS', service: 'express', serviceName: 'Express Shipping', rate: 14.99, estimatedDays: 2 },
      ]);
      setSelectedShipping({ carrier: 'USPS', service: 'standard', serviceName: 'Standard Shipping', rate: subtotal >= 75 ? 0 : 9.99, estimatedDays: 5 });
      setTax(subtotal * 0.08);
      setStep('shipping');
    } finally {
      setIsCalculating(false);
    }
  };

  const onSelectShipping = async () => {
    if (!selectedShipping || !addressData) return;
    
    setIsLoading(true);
    
    try {
      const newOrderId = generateOrderId();
      setOrderId(newOrderId);

      const finalTotal = subtotal + (selectedShipping.rate || 0) + tax;

      // Create payment intent
      const response = await fetch('/api/checkout/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalTotal,
          orderId: newOrderId,
          customerEmail: addressData.email,
          shippingAddress: {
            firstName: addressData.firstName,
            lastName: addressData.lastName,
            address1: addressData.address1,
            address2: addressData.address2,
            city: addressData.city,
            state: addressData.state,
            postalCode: addressData.postalCode,
            country: addressData.country,
            phone: addressData.phone,
          },
          items: items.map(item => ({
            productId: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            color: item.color,
            size: item.size,
          })),
          userId: user?.id,
          shipping: selectedShipping.rate,
          tax: tax,
          shippingService: selectedShipping.service,
        }),
      });

      const { clientSecret, error } = await response.json();
      
      if (error) {
        throw new Error(error);
      }

      if (!clientSecret) {
         throw new Error('Failed to init payment: No client secret returned');
      }

      setClientSecret(clientSecret);
      setStep('payment');
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      setApiError(error.message || 'Failed to initialize payment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while waiting for hydration
  if (!mounted) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
        <p className="text-muted-foreground mt-4">Loading checkout...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="font-heading text-2xl mb-2">Your cart is empty</h2>
        <p className="text-muted-foreground mb-4">Add some items to checkout.</p>
        <Button asChild>
          <Link href="/shop">Continue Shopping</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      {/* Left Column - Form */}
      <div className="space-y-6">
        <Link href="/cart" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Cart
        </Link>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 text-sm">
          <span className={step === 'info' ? 'text-sage-600 font-medium' : 'text-muted-foreground'}>
            1. Shipping Info
          </span>
          <span className="text-muted-foreground">/</span>
          <span className={step === 'shipping' ? 'text-sage-600 font-medium' : 'text-muted-foreground'}>
            2. Shipping Method
          </span>
          <span className="text-muted-foreground">/</span>
          <span className={step === 'payment' ? 'text-sage-600 font-medium' : 'text-muted-foreground'}>
            3. Payment
          </span>
        </div>

        {step === 'info' ? (
          <form onSubmit={handleSubmit(onSubmitInfo)} className="space-y-6">
            {/* Contact Info */}
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="your@email.com"
                  />
                  {errors.email && (
                    <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Shipping Address */}
            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" {...register('firstName')} />
                    {errors.firstName && (
                      <p className="text-sm text-red-500 mt-1">{errors.firstName.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" {...register('lastName')} />
                    {errors.lastName && (
                      <p className="text-sm text-red-500 mt-1">{errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="address1">Address</Label>
                  <Input id="address1" {...register('address1')} placeholder="Street address" />
                  {errors.address1 && (
                    <p className="text-sm text-red-500 mt-1">{errors.address1.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="address2">Apartment, suite, etc. (optional)</Label>
                  <Input id="address2" {...register('address2')} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input id="city" {...register('city')} />
                    {errors.city && (
                      <p className="text-sm text-red-500 mt-1">{errors.city.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input id="state" {...register('state')} placeholder="e.g. NY, CA" />
                    {errors.state && (
                      <p className="text-sm text-red-500 mt-1">{errors.state.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="postalCode">Postal Code</Label>
                    <Input id="postalCode" {...register('postalCode')} />
                    {errors.postalCode && (
                      <p className="text-sm text-red-500 mt-1">{errors.postalCode.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Select defaultValue="US" onValueChange={(value) => setValue('country', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US">United States</SelectItem>
                        <SelectItem value="CA">Canada</SelectItem>
                        <SelectItem value="GB">United Kingdom</SelectItem>
                        <SelectItem value="AE">UAE</SelectItem>
                        <SelectItem value="SA">Saudi Arabia</SelectItem>
                        <SelectItem value="PK">Pakistan</SelectItem>
                        <SelectItem value="MY">Malaysia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" {...register('phone')} placeholder="+1 (555) 000-0000" />
                  {errors.phone && (
                    <p className="text-sm text-red-500 mt-1">{errors.phone.message}</p>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox id="saveInfo" {...register('saveInfo')} />
                  <Label htmlFor="saveInfo" className="text-sm">
                    Save this information for next time
                  </Label>
                </div>
              </CardContent>
            </Card>

            <Button type="submit" size="lg" className="w-full" disabled={isCalculating}>
              {isCalculating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                'Proceed to Shipping Method'
              )}
            </Button>
          </form>
        ) : step === 'shipping' ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Select Shipping Method
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {shippingRates.map((rate) => {
                  const isFree = subtotal >= 75 && rate.service === shippingRates[0]?.service;
                  const displayRate = isFree ? 0 : rate.rate;
                  
                  return (
                    <label
                      key={rate.service}
                      className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedShipping?.service === rate.service
                          ? 'border-sage-500 bg-sage-50 dark:bg-sage-900/20'
                          : 'border-border hover:border-sage-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="shipping"
                          checked={selectedShipping?.service === rate.service}
                          onChange={() => setSelectedShipping({ ...rate, rate: displayRate })}
                          className="text-sage-600"
                        />
                        <div>
                          <p className="font-medium">{rate.serviceName}</p>
                          <p className="text-sm text-muted-foreground">
                            {rate.estimatedDays === 1 
                              ? 'Delivery tomorrow' 
                              : `${rate.estimatedDays} business days`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {isFree ? (
                          <div>
                            <span className="font-medium text-green-600">FREE</span>
                            <p className="text-xs text-muted-foreground line-through">
                              {formatPrice(rate.rate)}
                            </p>
                          </div>
                        ) : (
                          <span className="font-medium">{formatPrice(rate.rate)}</span>
                        )}
                      </div>
                    </label>
                  );
                })}
                
                {subtotal < 75 && (
                  <p className="text-sm text-center text-muted-foreground bg-muted p-3 rounded-lg">
                    Add {formatPrice(75 - subtotal)} more for FREE shipping!
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setStep('info')}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                size="lg"
                className="flex-1"
                onClick={onSelectShipping}
                disabled={!selectedShipping || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Continue to Payment'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent>
              {apiError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm">
                  {apiError}
                </div>
              )}
              {clientSecret && (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: 'stripe',
                      variables: {
                        colorPrimary: '#b5c1a0',
                      },
                    },
                  }}
                >
                  <PaymentForm
                    clientSecret={clientSecret}
                    onSuccess={() => {
                      clearCart();
                      router.push('/checkout/success');
                    }}
                  />
                </Elements>
              )}
              <Button
                variant="ghost"
                className="w-full mt-4"
                onClick={() => setStep('shipping')}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Shipping
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right Column - Order Summary */}
      <div className="lg:sticky lg:top-24 h-fit">
        <Card>
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Items */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {items.map((item) => (
                <div key={`${item.productId}-${item.color}-${item.size}`} className="flex gap-3">
                  <div className="relative w-16 h-20 bg-muted rounded-md overflow-hidden shrink-0">
                    {getValidImageSrc(item.image) && (
                      <Image
                        src={getValidImageSrc(item.image)!}
                        alt={item.name}
                        fill
                        className="object-cover"
                      />
                    )}
                    <span className="absolute -top-1 -right-1 bg-navy-900 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                      {item.quantity}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.name}</p>
                    {(item.color || item.size) && (
                      <p className="text-xs text-muted-foreground">
                        {item.color}{item.color && item.size && ' / '}{item.size}
                      </p>
                    )}
                    <p className="text-sm font-medium mt-1">
                      {formatPrice(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span>
                  {step === 'info' ? (
                    <span className="text-muted-foreground">Calculated at next step</span>
                  ) : shipping === 0 ? (
                    <span className="text-green-600">Free</span>
                  ) : (
                    formatPrice(shipping)
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span>
                  {step === 'info' ? (
                    <span className="text-muted-foreground">Calculated at next step</span>
                  ) : (
                    formatPrice(tax)
                  )}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>

            {selectedShipping && step !== 'info' && (
              <div className="bg-muted rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4 text-sage-600" />
                  <span>
                    {selectedShipping.serviceName} - 
                    {selectedShipping.estimatedDays === 1 
                      ? ' Arrives tomorrow' 
                      : ` ${selectedShipping.estimatedDays} business days`}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
