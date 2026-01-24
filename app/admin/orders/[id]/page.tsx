'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getOrder, updateOrder } from '@/lib/pocketbase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, Copy, Check, Printer, Truck, CheckCircle2, 
  MapPin, Mail, Phone, Calendar, DollarSign 
} from 'lucide-react';
import { formatPrice, formatDate } from '@/lib/utils';
import type { Order } from '@/types';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

interface OrderDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function OrderDetailsPage({ params }: OrderDetailsPageProps) {
  // Unwrap params using a hook or async (in client component, we use use) - actually props are promises in Next.js 15
  // But to be safe and standard, let's use useEffect to fetch.
  // We need to resolve params.
  // Wait, in Next.js 13/14 client components don't receive params as promise, they receive them directly?
  // Note: Next.js 15 might change this, but usually server components allow async props.
  // Since this is 'use client', params is likely passed as an object, but let's handle the promise if passed from a parent layout or verify.
  // Let's assume standard Next.js 14 behavior: params is an object. 
  // Wait, I declared it as Promise above. If it's a client component, Next.js passes params directly usually.
  // Actually, let's use React.use() if available or just assume it is passed.
  // Re-reading: "params: Promise<{ id: string }>". This signature is for Server Components.
  // If I want 'use client' I should probably wrap it. 
  // Let's make the Page component async (Server Component) and the content a Client Component?
  // Or just fetch inside useEffect using `useParams()` hook which is safer for client components.
  // I will use `useParams` hook.
  
  return <OrderDetailsContent />;
}

import { useParams } from 'next/navigation';

function OrderDetailsContent() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  
  useEffect(() => {
    if (id) loadOrder();
  }, [id]);
  
  async function loadOrder() {
    try {
      const data = await getOrder(id);
      setOrder(data);
    } catch(e) {
      console.error(e);
      // router.push('/admin/orders'); // Optional: redirect if not found
    } finally {
      setLoading(false);
    }
  }
  
  const handleCopyAddress = () => {
    if (!order) return;
    const addr = order.shippingAddress as any;
    const text = [
      addr.firstName + ' ' + addr.lastName,
      addr.address1,
      addr.address2,
      `${addr.city}, ${addr.state} ${addr.postalCode}`,
      addr.country
    ].filter(Boolean).join('\n');
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!order) return;
    if (!confirm(`Mark order as ${newStatus}?`)) return;
    
    try {
      // Cast newStatus to match the union type required by PocketBase types
      await updateOrder(order.id, { status: newStatus as any });
      setOrder({ ...order, status: newStatus as any });
    } catch(e) {
      alert('Failed to update status');
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading order...</div>;
  if (!order) return <div className="p-8 text-center text-destructive">Order not found</div>;

  const address = order.shippingAddress as any || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
        </Button>
        <div className="flex gap-2">
          {order.status !== 'shipped' && order.status !== 'delivered' && (
             <Button onClick={() => handleStatusUpdate('shipped')}>
                <Truck className="mr-2 h-4 w-4" /> Mark Shipped
             </Button>
          )}
          {order.status === 'shipped' && (
             <Button variant="default" onClick={() => handleStatusUpdate('delivered')}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Delivered
             </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>
      
      {/* Header Info */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
             <CardTitle className="flex justify-between items-center">
                <span>Order #{order.orderId}</span>
                <Badge>{order.status}</Badge>
             </CardTitle>
             <CardDescription>
                Placed on {formatDate(order.created)}
             </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
             <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" /> {order.email}
             </div>
             {address.phone && (
               <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" /> {address.phone}
               </div>
             )}
             <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" /> Total: {formatPrice(order.total)}
             </div>
          </CardContent>
        </Card>
        
        <Card>
           <CardHeader className="pb-4 flex flex-row items-start justify-between">
              <div>
                <CardTitle className="mb-2">Shipping Address</CardTitle>
                <CardDescription>Destination for this order</CardDescription>
              </div>
              <Button size="icon" variant="outline" onClick={handleCopyAddress} title="Copy Address">
                 {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
           </CardHeader>
           <CardContent className="text-sm">
              <div className="font-semibold mb-1">
                 {address.firstName} {address.lastName}
              </div>
              <div>{address.address1}</div>
              {address.address2 && <div>{address.address2}</div>}
              <div>{address.city}, {address.state} {address.postalCode}</div>
              <div>{address.country}</div>
           </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead>Product</TableHead>
                 <TableHead>Price</TableHead>
                 <TableHead>Qty</TableHead>
                 <TableHead>Total</TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
                {(order.items as unknown as any[]).map((item, i) => ( // Double cast to fix TS error
                  <TableRow key={i}>
                    <TableCell>
                      <div className="font-medium text-base mb-1">{item.name}</div>
                      <div className="text-xs text-muted-foreground flex gap-2">
                         <span>SKU: {item.sku || 'N/A'}</span>
                         {item.color && <Badge variant="outline" className="text-[10px]">{item.color}</Badge>}
                         {item.size && <Badge variant="outline" className="text-[10px]">{item.size}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{formatPrice(item.price)}</TableCell>
                    <TableCell>x{item.quantity}</TableCell>
                    <TableCell className="font-semibold">{formatPrice(item.price * item.quantity)}</TableCell>
                  </TableRow>
                ))}
             </TableBody>
           </Table>
        </CardContent>
      </Card>
      
      {/* Financial Summary */}
       <div className="flex justify-end">
         <Card className="w-full md:w-1/3">
            <CardContent className="p-6 space-y-3">
               <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(order.subtotal)}</span>
               </div>
               <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{formatPrice(order.shipping)}</span>
               </div>
               <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatPrice(order.tax)}</span>
               </div>
               <Separator />
               <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{formatPrice(order.total)}</span>
               </div>
               <div className="pt-2">
                 <Badge variant={order.paymentStatus === 'paid' ? 'default' : 'destructive'} className="w-full justify-center">
                    Payment: {order.paymentStatus?.toUpperCase()}
                 </Badge>
               </div>
            </CardContent>
         </Card>
       </div>
    </div>
  );
}
