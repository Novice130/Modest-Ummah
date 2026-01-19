'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, ChevronLeft, Plus, Trash2, Edit, Check, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getPocketBase } from '@/lib/pocketbase';
import type { ShippingAddress } from '@/types';

const addressSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  address1: z.string().min(5, 'Address is required'),
  address2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  postalCode: z.string().min(3, 'Postal code is required'),
  country: z.string().min(2, 'Country is required'),
  phone: z.string().min(10, 'Phone number is required'),
  isDefault: z.boolean().optional(),
});

type AddressFormData = z.infer<typeof addressSchema>;

interface SavedAddress extends ShippingAddress {
  id: string;
  isDefault?: boolean;
}

export default function AddressesPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      country: 'US',
    },
  });

  useEffect(() => {
    const checkAuth = async () => {
      const pb = getPocketBase();
      
      if (!pb.authStore.isValid) {
        router.push('/auth/login?redirect=/account/addresses');
        return;
      }

      // Load addresses from localStorage (in production, use PocketBase)
      try {
        const saved = localStorage.getItem('modest-ummah-addresses');
        if (saved) {
          setAddresses(JSON.parse(saved));
        }
      } catch (error) {
        console.error('Error loading addresses:', error);
      }

      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  const saveAddresses = (updated: SavedAddress[]) => {
    setAddresses(updated);
    localStorage.setItem('modest-ummah-addresses', JSON.stringify(updated));
  };

  const onSubmit = async (data: AddressFormData) => {
    if (editingAddress) {
      // Update existing
      const updated = addresses.map(addr =>
        addr.id === editingAddress.id
          ? { ...data, id: addr.id, isDefault: data.isDefault }
          : data.isDefault ? { ...addr, isDefault: false } : addr
      );
      saveAddresses(updated);
    } else {
      // Add new
      const newAddress: SavedAddress = {
        ...data,
        id: `addr_${Date.now()}`,
        isDefault: addresses.length === 0 || data.isDefault,
      };
      
      const updated = data.isDefault
        ? [...addresses.map(a => ({ ...a, isDefault: false })), newAddress]
        : [...addresses, newAddress];
      
      saveAddresses(updated);
    }

    setIsDialogOpen(false);
    setEditingAddress(null);
    reset();
  };

  const deleteAddress = (id: string) => {
    const updated = addresses.filter(a => a.id !== id);
    if (updated.length > 0 && !updated.some(a => a.isDefault)) {
      updated[0].isDefault = true;
    }
    saveAddresses(updated);
  };

  const setDefaultAddress = (id: string) => {
    const updated = addresses.map(a => ({
      ...a,
      isDefault: a.id === id,
    }));
    saveAddresses(updated);
  };

  const openEditDialog = (address: SavedAddress) => {
    setEditingAddress(address);
    Object.entries(address).forEach(([key, value]) => {
      if (key !== 'id') {
        setValue(key as keyof AddressFormData, value as any);
      }
    });
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingAddress(null);
    reset({ country: 'US' });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container-custom py-8">
        <Link href="/account" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Account
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading text-3xl mb-2">Saved Addresses</h1>
            <p className="text-muted-foreground">
              Manage your shipping addresses
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Address
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingAddress ? 'Edit Address' : 'Add New Address'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                  <Input id="address1" {...register('address1')} />
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
                    <Input id="state" {...register('state')} />
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
                    <Select defaultValue="US" onValueChange={(v) => setValue('country', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US">United States</SelectItem>
                        <SelectItem value="CA">Canada</SelectItem>
                        <SelectItem value="GB">United Kingdom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" {...register('phone')} />
                  {errors.phone && (
                    <p className="text-sm text-red-500 mt-1">{errors.phone.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : editingAddress ? 'Update Address' : 'Add Address'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {addresses.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MapPin className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="font-heading text-xl mb-2">No saved addresses</h2>
              <p className="text-muted-foreground mb-6">
                Add an address to speed up checkout
              </p>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Address
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {addresses.map((address) => (
              <Card key={address.id} className={address.isDefault ? 'border-sage-500' : ''}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>{address.firstName} {address.lastName}</span>
                    {address.isDefault && (
                      <span className="text-xs bg-sage-100 text-sage-700 px-2 py-1 rounded">
                        Default
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm mb-4">
                    {address.address1}
                    {address.address2 && <>, {address.address2}</>}
                    <br />
                    {address.city}, {address.state} {address.postalCode}
                    <br />
                    {address.country}
                    <br />
                    {address.phone}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(address)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    {!address.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDefaultAddress(address.id)}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Set Default
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteAddress(address.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
