'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  fetchSettingsAction,
  saveSettingsAction,
} from '@/lib/actions/settings.actions';
import PirateShipConnector from '@/components/admin/pirate-ship-connector';

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [announcementText, setAnnouncementText] = useState('');

  useEffect(() => {
    fetchSettingsAction()
      .then((s) => {
        setStoreName(s.storeName);
        setContactEmail(s.contactEmail);
        setSupportEmail(s.supportEmail);
        setStorePhone(s.storePhone);
        setStoreAddress(s.storeAddress);
        setAnnouncementText(s.announcementText);
      })
      .catch((e) => {
        toast({
          title: 'Failed to load settings',
          description: e?.message || 'Something went wrong.',
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveSettingsAction({
        storeName,
        contactEmail,
        supportEmail,
        storePhone,
        storeAddress,
        announcementText,
      });
      setStoreName(saved.storeName);
      setContactEmail(saved.contactEmail);
      setSupportEmail(saved.supportEmail);
      setStorePhone(saved.storePhone);
      setStoreAddress(saved.storeAddress);
      setAnnouncementText(saved.announcementText);
      toast({ title: 'Settings saved' });
    } catch (e: any) {
      toast({
        title: 'Failed to save settings',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
            <Label htmlFor="store-name">Store Name</Label>
            <Input
              id="store-name"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-email">Contact Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-email">Support Email</Label>
              <Input
                id="support-email"
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-phone">Store Phone</Label>
            <Input
              id="store-phone"
              value={storePhone}
              onChange={(e) => setStorePhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-address">Store Address</Label>
            <Input
              id="store-address"
              value={storeAddress}
              onChange={(e) => setStoreAddress(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="announcement">Announcement Bar Text</Label>
            <Textarea
              id="announcement"
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              placeholder="Shown in the top bar on every page (leave empty to hide)."
            />
          </div>
        </CardContent>
      </Card>

      <PirateShipConnector />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
