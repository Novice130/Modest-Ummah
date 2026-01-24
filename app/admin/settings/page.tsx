'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Save } from 'lucide-react';

export default function AdminSettingsPage() {
  const [storeName, setStoreName] = useState('Modest Ummah');
  const [storeEmail, setStoreEmail] = useState('admin@modestummah.com');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // Placeholder - in a real app, save to PocketBase or env
    await new Promise(r => setTimeout(r, 500));
    alert('Settings saved! (Placeholder - not persisted)');
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your store configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Store Information</CardTitle>
          <CardDescription>Basic details about your store.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Store Name</Label>
            <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Contact Email</Label>
            <Input value={storeEmail} onChange={(e) => setStoreEmail(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Connected services.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Stripe</div>
              <div className="text-sm text-muted-foreground">Payment processing</div>
            </div>
            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">Connected</span>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Pirate Ship</div>
              <div className="text-sm text-muted-foreground">Shipping labels</div>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Manual Export</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
