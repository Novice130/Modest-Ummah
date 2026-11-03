'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  fetchSettingsAction,
  saveSettingsAction,
  fetchStoreConfigAction,
  type StoreConfigItem,
} from '@/lib/actions/settings.actions';
import PirateShipConnector from '@/components/admin/pirate-ship-connector';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [savedContactEmail, setSavedContactEmail] = useState('');
  const [config, setConfig] = useState<StoreConfigItem[]>([]);

  useEffect(() => {
    Promise.all([fetchSettingsAction(), fetchStoreConfigAction()])
      .then(([s, c]) => {
        setContactEmail(s.contactEmail);
        setSavedContactEmail(s.contactEmail);
        setConfig(c);
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

  const emailInvalid = contactEmail.trim() !== '' && !EMAIL_RE.test(contactEmail.trim());
  const dirty = contactEmail.trim().toLowerCase() !== savedContactEmail;

  const handleSave = async () => {
    if (!contactEmail.trim() || emailInvalid) {
      toast({
        title: 'Enter a valid email address',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      // Only the field this page edits; the action preserves stored values
      // for everything else.
      const saved = await saveSettingsAction({ contactEmail });
      setContactEmail(saved.contactEmail);
      setSavedContactEmail(saved.contactEmail);
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
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Recorded on every contact-form message and newsletter sign-up. The
            forms do not send email yet: read submissions under Customers →
            Messages and Subscribers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="contact-email">Store contact email</Label>
            <Input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              aria-invalid={emailInvalid}
            />
            {emailInvalid && (
              <p className="text-sm text-destructive">Enter a valid email address.</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !dirty || emailInvalid}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Store Configuration</CardTitle>
          <CardDescription>
            What checkout and the storefront use right now. These come from
            the server environment and code, not from this page; change them
            in the deployment settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            {config.map((item) => (
              <div
                key={item.label}
                className="grid gap-1 py-3 sm:grid-cols-[200px_1fr] sm:gap-4"
              >
                <dt className="text-sm font-medium">{item.label}</dt>
                <dd className="text-sm">
                  <span className="flex items-start gap-2">
                    {item.ok ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                    )}
                    <span className="break-words">{item.value}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5 ml-6 break-words">
                    {item.source}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign-in security</CardTitle>
          <CardDescription>
            Two-factor sign-in for admin accounts.{' '}
            <Link href="/admin/settings/security" className="underline">
              Manage two-factor
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>

      <PirateShipConnector />
    </div>
  );
}
