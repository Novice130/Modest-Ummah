'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  Loader2,
  PanelRight,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import ProductCard from '@/components/product/product-card';
import ProductGallery from '@/components/product/product-gallery';
import ProductInfo from '@/components/product/product-info';
import { SECTIONS, type SectionId } from '@/lib/product-builder-schema';
import type { useProductBuilder } from './use-product-builder';
import BasicsSection from './sections/basics';
import MediaSection from './sections/media';
import OrganizationSection from './sections/organization';
import PricingSection from './sections/pricing';
import InventorySection from './sections/inventory';
import LinkedSection from './sections/linked';
import PublishSection from './sections/publish';

type Builder = ReturnType<typeof useProductBuilder>;

interface ProductBuilderProps {
  builder: Builder;
  /** true when the product was opened via /admin/products/new */
  isNew?: boolean;
  /** pass through to the top bar */
  title?: string;
}

export default function ProductBuilder({ builder, isNew, title }: ProductBuilderProps) {
  const router = useRouter();
  const [previewMode, setPreviewMode] = useState<'card' | 'page'>('card');

  const {
    doc,
    activeSection,
    navigateTo,
    sectionComplete,
    sectionVisited,
    errors,
    save,
    saving,
    saveStatus,
    saveError,
    lastSavedAt,
    dirty,
    autosaveEnabled,
    persistedStatus,
    productId,
    discardLocalDraft,
    previewProduct,
    previewOpen,
    setPreviewOpen,
  } = builder;

  const navItemClass = (id: SectionId) =>
    cn(
      'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-left transition-colors',
      activeSection === id
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    );

  const renderSection = () => {
    switch (activeSection) {
      case 'basics':
        return <BasicsSection builder={builder} />;
      case 'media':
        return <MediaSection builder={builder} />;
      case 'organization':
        return (
          <div className="space-y-10">
            <OrganizationSection builder={builder} />
            <LinkedSection builder={builder} />
          </div>
        );
      case 'pricing':
        return <PricingSection builder={builder} />;
      case 'inventory':
        return <InventorySection builder={builder} />;
      case 'publish':
        return <PublishSection builder={builder} />;
      default:
        return null;
    }
  };

  const saveButtonLabel =
    doc.status === 'published' && persistedStatus !== 'published'
      ? 'Save & publish'
      : doc.status === 'scheduled' && persistedStatus !== 'scheduled'
        ? 'Save & schedule'
        : 'Save';

  const statusLine = (() => {
    if (saveStatus === 'saving') return 'Saving…';
    if (saveStatus === 'error') return saveError || 'Save failed';
    if (!dirty) {
      // Autosave stores a draft even when Published/Scheduled is picked, and
      // then reports nothing unsaved; say that the status step is still open.
      if (productId && persistedStatus === 'draft' && doc.status !== 'draft') {
        return `Saved as a draft — click “${saveButtonLabel}” to finish`;
      }
      return lastSavedAt ? `All changes saved · ${lastSavedAt.toLocaleTimeString()}` : 'No unsaved changes';
    }
    if (!autosaveEnabled) return 'Unsaved changes — click Save';
    if (saveStatus === 'incomplete') {
      return productId
        ? 'Draft not autosaved — fix the highlighted fields'
        : 'Kept in this browser until the required fields are filled';
    }
    return 'Unsaved changes — autosaving draft…';
  })();

  const leave = () => {
    if (dirty && !window.confirm('Leave without saving? Your unsaved changes will be lost.')) return;
    if (
      !dirty &&
      productId &&
      persistedStatus === 'draft' &&
      doc.status !== 'draft' &&
      !window.confirm(`This product is still a draft. Leave without clicking “${saveButtonLabel}”?`)
    ) {
      return;
    }
    router.push('/admin/products');
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-4 md:-m-8 flex-col lg:flex-row">
      {/* ─── Left nav (sticky sections) ─────────────────── */}
      <div className="hidden lg:flex w-64 shrink-0 flex-col border-r bg-background">
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" onClick={leave}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to products
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <nav className="p-3 space-y-1" aria-label="Product sections">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={navItemClass(section.id)}
                onClick={() => navigateTo(section.id)}
                aria-current={activeSection === section.id ? 'step' : undefined}
              >
                <span className="flex-1 truncate">{section.label}</span>
                {sectionComplete(section.id) ? (
                  <Check className="h-4 w-4 text-sage-500" aria-label="Complete" />
                ) : (
                  sectionVisited.has(section.id) && (
                    <span className="text-xs text-destructive" aria-label="Has errors">
                      !
                    </span>
                  )
                )}
              </button>
            ))}
          </nav>
        </ScrollArea>
        <div className="p-4 border-t space-y-2">
          <Button className="w-full" onClick={() => save()} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saveButtonLabel}
          </Button>
          <p
            className={cn(
              'text-xs text-center',
              saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'
            )}
            role="status"
          >
            {statusLine}
          </p>
          {!productId && dirty && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => {
                if (window.confirm('Discard this unsaved product?')) discardLocalDraft();
              }}
            >
              Discard draft
            </Button>
          )}
        </div>
      </div>

      {/* ─── Editor pane ────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="p-4 border-b flex items-center justify-between bg-muted/10">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile nav */}
            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="Open sections menu">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                <ScrollArea className="h-full">
                  <nav className="p-3 space-y-1" aria-label="Product sections">
                    {SECTIONS.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        className={navItemClass(section.id)}
                        onClick={() => navigateTo(section.id)}
                      >
                        <span className="flex-1 truncate">{section.label}</span>
                        {sectionComplete(section.id) && (
                          <Check className="h-4 w-4 text-sage-500" />
                        )}
                      </button>
                    ))}
                  </nav>
                </ScrollArea>
              </SheetContent>
              </Sheet>
            </div>
            <h2 className="font-semibold truncate">
              {doc.name || 'New product'}
              <Badge variant="outline" className="ml-2 capitalize">
                {productId ? persistedStatus ?? doc.status : 'not saved'}
              </Badge>
              {dirty && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">Unsaved changes</span>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen((v) => !v)}
              className="lg:hidden"
              aria-label="Toggle preview"
            >
              <Eye className="h-4 w-4 mr-2" /> Preview
            </Button>
            <Button size="sm" onClick={() => save()} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saveButtonLabel}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 max-w-3xl">{renderSection()}</div>
        </ScrollArea>
      </div>

      {/* ─── Preview pane (desktop) ─────────────────────── */}
      <div className="hidden lg:flex w-[420px] xl:w-[480px] shrink-0 flex-col border-l bg-muted/30">
        <div className="p-4 border-b flex items-center justify-between bg-background">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Live preview</span>
          </div>
          <div className="flex rounded-md border overflow-hidden">
            {(['card', 'page'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={cn(
                  'px-3 py-1 text-xs',
                  previewMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
                onClick={() => setPreviewMode(mode)}
              >
                {mode === 'card' ? 'Card' : 'Page'}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="flex-1">
          {previewMode === 'card' ? (
            <div className="flex items-center justify-center p-8">
              <div className="w-full max-w-xs">
                <ProductCard product={previewProduct} index={0} />
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <ProductGallery images={previewProduct.images} name={previewProduct.name} />
              <ProductInfo product={previewProduct} />
            </div>
          )}
        </ScrollArea>
        <div className="p-3 border-t bg-background text-xs text-muted-foreground text-center">
          {previewMode === 'card'
            ? 'Card as shown in shop listings'
            : 'Page as shown on the product detail page'}
        </div>
      </div>

      {/* ─── Preview drawer (mobile/tablet) ─────────────── */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              <div className="flex rounded-md border overflow-hidden">
                {(['card', 'page'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={cn(
                      'flex-1 px-3 py-2 text-sm',
                      previewMode === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    )}
                    onClick={() => setPreviewMode(mode)}
                  >
                    {mode === 'card' ? 'Card' : 'Page'}
                  </button>
                ))}
              </div>
              {previewMode === 'card' ? (
                <div className="flex justify-center">
                  <div className="w-full max-w-xs">
                    <ProductCard product={previewProduct} index={0} />
                  </div>
                </div>
              ) : (
                <>
                  <ProductGallery images={previewProduct.images} name={previewProduct.name} />
                  <ProductInfo product={previewProduct} />
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
