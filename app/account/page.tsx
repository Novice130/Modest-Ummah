'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Package, Heart, MapPin, CreditCard, Settings, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/lib/store';
import { signOut, getOrders, getPocketBase } from '@/lib/pocketbase';

const accountLinks = [
  {
    title: 'Orders',
    description: 'View your order history and track shipments',
    href: '/account/orders',
    icon: Package,
  },
  {
    title: 'Wishlist',
    description: 'Products you\'ve saved for later',
    href: '/account/wishlist',
    icon: Heart,
  },
  {
    title: 'Addresses',
    description: 'Manage your shipping addresses',
    href: '/account/addresses',
    icon: MapPin,
  },
  {
    title: 'Payment Methods',
    description: 'Manage your saved payment methods',
    href: '/account/payment',
    icon: CreditCard,
  },
  {
    title: 'Account Settings',
    description: 'Update your profile and preferences',
    href: '/account/settings',
    icon: Settings,
  },
];

export default function AccountPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalOrders: 0,
    wishlistItems: 0,
    savedAddresses: 0,
    rewardPoints: 0,
  });

  useEffect(() => {
    const checkAuth = async () => {
      const pb = getPocketBase();
      
      if (!pb.authStore.isValid) {
        router.push('/auth/login?redirect=/account');
        return;
      }

      // Load user stats
      try {
        if (pb.authStore.model?.id) {
          const orders = await getOrders(pb.authStore.model.id);
          setStats(prev => ({
            ...prev,
            totalOrders: orders.totalItems || 0,
          }));
        }
      } catch (error) {
        console.error('Error loading account stats:', error);
      }

      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
      </div>
    );
  }

  const displayUser = user || { name: 'Guest', email: '' };
  const memberSince = user?.created 
    ? new Date(user.created).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Recently';

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container-custom py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-sage-300 flex items-center justify-center">
              <User className="h-8 w-8 text-navy-900" />
            </div>
            <div>
              <h1 className="font-heading text-2xl">{displayUser.name}</h1>
              <p className="text-muted-foreground">{displayUser.email}</p>
              <p className="text-sm text-muted-foreground">Member since {memberSince}</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-sage-600">{stats.totalOrders}</p>
              <p className="text-sm text-muted-foreground">Total Orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-sage-600">{stats.wishlistItems}</p>
              <p className="text-sm text-muted-foreground">Wishlist Items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-sage-600">{stats.savedAddresses}</p>
              <p className="text-sm text-muted-foreground">Saved Addresses</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-sage-600">{stats.rewardPoints}</p>
              <p className="text-sm text-muted-foreground">Reward Points</p>
            </CardContent>
          </Card>
        </div>

        {/* Account Links */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accountLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="h-full hover:border-sage-300 transition-colors cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-sage-100 dark:bg-sage-900/30 flex items-center justify-center shrink-0">
                      <link.icon className="h-6 w-6 text-sage-600" />
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">{link.title}</h3>
                      <p className="text-sm text-muted-foreground">{link.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
