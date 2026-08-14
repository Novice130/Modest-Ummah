'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Copy, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  fetchConnectorStatusAction,
  fetchIntegrationEventsAction,
  createApiKeyAction,
  revokeApiKeyAction,
  type ConnectorStatus,
  type IntegrationEventSummary,
} from '@/lib/actions/connector.actions';

/**
 * Pirate Ship integration panel.
 *
 * Pirate Ship has no public API — it imports orders from store platforms. This
 * store exposes a WooCommerce-compatible REST surface at /wp-json/wc/v3, so
 * Pirate Ship connects to it as a self-hosted WooCommerce store.
 */
export default function PirateShipConnector() {
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [events, setEvents] = useState<IntegrationEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState('Pirate Ship');
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<{
    consumerKey: string;
    consumerSecret: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([
        fetchConnectorStatusAction(),
        fetchIntegrationEventsAction(25),
      ]);
      setStatus(s);
      setEvents(e);
    } catch (error: any) {
      toast({
        title: 'Failed to load integration status',
        description: error?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: `Could not copy ${label}`, variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      // read_write is required: Pirate Ship writes the order status and the
      // tracking number back after buying a label.
      const created = await createApiKeyAction({
        description,
        permissions: 'read_write',
      });
      setFreshKey(created);
      await load();
    } catch (error: any) {
      toast({
        title: 'Failed to create API key',
        description: error?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeApiKeyAction(revokeTarget);
      toast({ title: 'API key revoked' });
      await load();
    } catch (error: any) {
      toast({
        title: 'Failed to revoke key',
        description: error?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setRevokeTarget(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                Pirate Ship
                {status.enabled ? (
                  <Badge variant="success">Connected surface live</Badge>
                ) : (
                  <Badge variant="destructive">Disabled</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Buy postage from your orders. Pirate Ship connects to this store
                through its WooCommerce integration.
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={load} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {!status.enabled && (
            <Warning>
              Set <code className="font-mono">WOO_SHIM_ENABLED=true</code> in the
              deployment environment. Until then every request to the integration
              endpoint answers 404.
            </Warning>
          )}

          {!status.originConfigured && (
            <Warning>
              No ship-from address configured. Set the{' '}
              <code className="font-mono">PIRATESHIP_ORIGIN_*</code> variables, or
              labels will print the placeholder address{' '}
              <span className="font-mono">123 Business St, New York, NY 10001</span>.
            </Warning>
          )}

          {!status.emailConfigured && (
            <Warning>
              <code className="font-mono">BREVO_API_KEY</code> is unset, so the
              &ldquo;your order has shipped&rdquo; email cannot send when a
              tracking number arrives.
            </Warning>
          )}

          {/* ─── Connection details ─── */}
          <div className="space-y-2">
            <Label>Store URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={status.storeUrl} className="font-mono text-sm" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(status.storeUrl, 'Store URL')}
                aria-label="Copy store URL"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              In Pirate Ship: Settings → Integrations → Connect New Source →
              WooCommerce. Paste this URL with no trailing slash, then the key and
              secret below.
            </p>
          </div>

          {/* ─── Keys ─── */}
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="key-description">New API key label</Label>
                <Input
                  id="key-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Pirate Ship"
                />
              </div>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Generate
              </Button>
            </div>

            {status.keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active keys. Generate one to connect Pirate Ship.
              </p>
            ) : (
              <div className="rounded-md border divide-y">
                {status.keys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between gap-4 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {key.description}{' '}
                        <span className="font-mono text-muted-foreground">
                          …{key.truncatedKey}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {key.permissions === 'read_write' ? 'Read/Write' : 'Read only'}
                        {' · '}
                        {key.lastAccess
                          ? `last used ${new Date(key.lastAccess).toLocaleString()}`
                          : 'never used'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRevokeTarget(key.id)}
                      aria-label={`Revoke ${key.description}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Sync log ─── */}
          <div className="space-y-2">
            <Label>Recent integration requests</Label>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet. Once Pirate Ship connects, its requests appear here —
                any 404 is an endpoint it wants that this store does not serve yet.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs">
                      {event.method} {event.path}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={
                          event.statusCode >= 500
                            ? 'destructive'
                            : event.statusCode >= 400
                            ? 'gold'
                            : 'success'
                        }
                      >
                        {event.statusCode}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleTimeString()}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Secret is shown once and never again — it is not stored in plaintext. */}
      <AlertDialog open={Boolean(freshKey)} onOpenChange={() => setFreshKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy these now</AlertDialogTitle>
            <AlertDialogDescription>
              The consumer secret is shown once and is not recoverable. Only a
              hash of it is stored.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Consumer Key</Label>
              <div className="flex gap-2">
                <Input readOnly value={freshKey?.consumerKey || ''} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(freshKey?.consumerKey || '', 'Consumer key')}
                  aria-label="Copy consumer key"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Consumer Secret</Label>
              <div className="flex gap-2">
                <Input readOnly value={freshKey?.consumerSecret || ''} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(freshKey?.consumerSecret || '', 'Consumer secret')}
                  aria-label="Copy consumer secret"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setFreshKey(null)}>
              I have copied them
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
            <AlertDialogDescription>
              Pirate Ship will stop importing orders and stop writing tracking
              numbers back until you connect it with a new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border border-gold-200 bg-gold-200/20 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-mocha-700" />
      <div>{children}</div>
    </div>
  );
}
