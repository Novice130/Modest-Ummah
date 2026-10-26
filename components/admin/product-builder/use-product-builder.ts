'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultProductDocument,
  deriveStorefrontOptions,
  flattenIssues,
  productDocumentSchema,
  productToDocument,
  slugifyProductName,
  SECTIONS,
  type ProductDocument,
  type SectionId,
} from '@/lib/product-builder-schema';
import { saveProductAction, checkSlugAvailable, type SaveResult } from '@/lib/actions/product.actions';
import { useToast } from '@/hooks/use-toast';
import type { Product, ProductStatus } from '@/types';
import type { ProductAttributeSelect, ProductVariantSelect } from '@/lib/schema';

/**
 * Builder state machine: one product document, per-section Zod validation,
 * image upload, and the preview Product mapping.
 *
 * Saving:
 *  - Drafts (and products not created yet) autosave to the server once the
 *    document is valid. Autosave never changes status.
 *  - A live product (published / scheduled / pending) is only written by the
 *    Save button — editing a live product must not push half-finished edits
 *    to the storefront, and opening one must not touch it at all.
 *  - Until a new product exists on the server, the document is mirrored to
 *    localStorage so a refresh does not lose it.
 */

export interface BuilderInit {
  productId?: string;
  product?: Product | null;
  variants?: ProductVariantSelect[];
  attributes?: ProductAttributeSelect[];
}

/** Section field prefixes — zod paths are joined with '.' */
export const SECTION_FIELDS: Record<SectionId, string[]> = {
  basics: ['name', 'slug', 'productType', 'shortDescription', 'description'],
  media: ['images', 'imageAlts'],
  organization: [
    'categoryId',
    'tagIds',
    'featured',
    'newArrivalPinned',
    'excludeFromNewArrivals',
    'visibility',
    'upsellIds',
    'crossSellIds',
    'similarProductIds',
  ],
  pricing: [
    'price',
    'compareAtPrice',
    'saleStartsAt',
    'saleEndsAt',
    'taxClass',
    'attributes',
    'colorSwatches',
    'variants',
  ],
  inventory: [
    'sku',
    'manageStock',
    'stockQuantity',
    'inStock',
    'backorderPolicy',
    'lowStockThreshold',
    'weight',
    'lengthIn',
    'widthIn',
    'heightIn',
    'shippingClass',
  ],
  publish: ['metaTitle', 'metaDescription', 'ogImage', 'status', 'publishAt'],
};

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'incomplete';

const PENDING_KEY = 'builder-draft-pending';
const AUTOSAVE_DELAY_MS = 2000;
const UPLOAD_BATCH = 10; // matches MAX_FILES in app/api/upload/route.ts

/** Order-independent key for a variant's option combination. */
export function variantSignature(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}

/** Content key for dirty tracking; server-assigned variant ids are not edits. */
function docKey(doc: ProductDocument): string {
  return JSON.stringify({ ...doc, variants: doc.variants.map(({ id: _id, ...rest }) => rest) });
}

function firstBrokenSection(errors: Record<string, string[]>): SectionId | undefined {
  return SECTIONS.map((s) => s.id).find((section) =>
    Object.keys(errors).some((key) =>
      SECTION_FIELDS[section].some((f) => key === f || key.startsWith(f + '.'))
    )
  );
}

export function useProductBuilder(init: BuilderInit) {
  const { toast } = useToast();

  const [initialDoc] = useState<ProductDocument>(() =>
    init.product
      ? productToDocument(init.product, { variants: init.variants, attributes: init.attributes })
      : defaultProductDocument()
  );
  const [doc, setDoc] = useState<ProductDocument>(initialDoc);
  const [savedKey, setSavedKey] = useState(() => docKey(initialDoc));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [productId, setProductId] = useState<string | null>(init.productId ?? null);
  // Status as stored on the server — decides whether autosave may run.
  const [persistedStatus, setPersistedStatus] = useState<ProductStatus | null>(
    init.product?.status ?? null
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [sectionVisited, setSectionVisited] = useState<Set<SectionId>>(new Set());
  const [activeSection, setActiveSection] = useState<SectionId>('basics');
  const [previewOpen, setPreviewOpen] = useState(false);

  const docRef = useRef(doc);
  docRef.current = doc;
  const productIdRef = useRef(productId);
  productIdRef.current = productId;
  const slugStatusRef = useRef(slugStatus);
  slugStatusRef.current = slugStatus;
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<unknown> | null>(null);
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // An existing product's slug is its live URL: it never follows the name.
  const slugManual = useRef(Boolean(init.product));

  const dirty = useMemo(() => docKey(doc) !== savedKey, [doc, savedKey]);
  const autosaveEnabled = !productId || persistedStatus === 'draft';

  const markVisited = (section: SectionId) =>
    setSectionVisited((prev) => new Set(prev).add(section));

  const update = useCallback((fn: (draft: ProductDocument) => void) => {
    setDoc((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setErrors((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, []);

  // ── Restore an unsaved new product (client-only, after hydration) ──
  useEffect(() => {
    if (init.product) return;
    try {
      const pending = localStorage.getItem(PENDING_KEY);
      if (!pending) return;
      const parsed = productDocumentSchema.safeParse(JSON.parse(pending));
      // A partial document fails the full schema; merge it over the defaults
      // instead so required-but-empty fields do not discard the rest.
      const restored = parsed.success
        ? parsed.data
        : { ...defaultProductDocument(), ...(JSON.parse(pending) as Partial<ProductDocument>) };
      if (docKey(restored) === docKey(defaultProductDocument())) return;
      setDoc(restored);
      if (restored.slug) slugManual.current = restored.slug !== slugifyProductName(restored.name);
      toast({
        title: 'Restored your unsaved product',
        description: 'It was kept in this browser. Use “Discard draft” to start over.',
      });
    } catch {
      // Corrupt or unavailable storage — start fresh.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discardLocalDraft = useCallback(() => {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      // ignore
    }
    const fresh = defaultProductDocument();
    slugManual.current = false;
    setDoc(fresh);
    setSavedKey(docKey(fresh));
    setErrors({});
    setSaveStatus('idle');
  }, []);

  // ── Validation ─────────────────────────────────────────

  const validateSection = useCallback((section: SectionId): boolean => {
    const parsed = productDocumentSchema.safeParse(docRef.current);
    if (parsed.success) {
      setErrors({});
      return true;
    }
    const all = flattenIssues(parsed);
    const fields = SECTION_FIELDS[section];
    const scoped: Record<string, string[]> = {};
    for (const [key, messages] of Object.entries(all)) {
      if (fields.some((f) => key === f || key.startsWith(f + '.'))) scoped[key] = messages;
    }
    setErrors(scoped);
    return Object.keys(scoped).length === 0;
  }, []);

  /** Completion state for the left nav: silently validate. */
  const issues = useMemo(() => {
    const parsed = productDocumentSchema.safeParse(doc);
    return parsed.success ? {} : flattenIssues(parsed);
  }, [doc]);
  const sectionComplete = useCallback(
    (section: SectionId): boolean =>
      !Object.keys(issues).some((key) =>
        SECTION_FIELDS[section].some((f) => key === f || key.startsWith(f + '.'))
      ) && !(section === 'basics' && slugStatus === 'taken'),
    [issues, slugStatus]
  );

  const navigateTo = useCallback(
    (section: SectionId) => {
      markVisited(activeSection);
      // Validating the section being LEFT keeps errors scoped to where the
      // user was; completion state on the nav is computed independently.
      validateSection(activeSection);
      setActiveSection(section);
    },
    [activeSection, validateSection]
  );

  // ── Name / slug ────────────────────────────────────────

  const touchSlug = useCallback((value: string) => {
    if (slugTimer.current) clearTimeout(slugTimer.current);
    if (!value) {
      setSlugStatus('idle');
      return;
    }
    setSlugStatus('checking');
    slugTimer.current = setTimeout(async () => {
      try {
        const available = await checkSlugAvailable(value, productIdRef.current ?? undefined);
        setSlugStatus(available ? 'available' : 'taken');
      } catch {
        setSlugStatus('idle');
      }
    }, 400);
  }, []);

  /** Name input. The slug follows it until the admin edits the slug. */
  const setName = useCallback(
    (name: string) => {
      const follow = !slugManual.current;
      update((d) => {
        d.name = name;
        if (follow) d.slug = slugifyProductName(name);
      });
      if (follow) touchSlug(slugifyProductName(name));
    },
    [update, touchSlug]
  );

  const setSlug = useCallback(
    (raw: string) => {
      const slug = raw.toLowerCase().replace(/\s+/g, '-');
      // Clearing the field hands the slug back to the name.
      slugManual.current = slug !== '';
      update((d) => {
        d.slug = slug;
      });
      touchSlug(slug);
    },
    [update, touchSlug]
  );

  // ── Save plumbing ──────────────────────────────────────

  const applySaved = useCallback(
    (result: Extract<SaveResult, { ok: true }>, snapshot: ProductDocument) => {
      const wasNew = !productIdRef.current;
      productIdRef.current = result.productId;
      setProductId(result.productId);
      setPersistedStatus(result.status);

      // The server derives an empty slug from the name; adopt it, and adopt
      // the ids of newly created variants so the next save updates in place.
      const ids = new Map(result.variants.map((v) => [variantSignature(v.attributes), v.id]));
      setDoc((prev) => {
        let next = prev;
        if (!prev.slug && result.slug) next = { ...next, slug: result.slug };
        if (ids.size > 0 && prev.variants.some((v) => ids.get(variantSignature(v.attributes)) !== v.id)) {
          next = {
            ...next,
            variants: prev.variants.map((v) => ({ ...v, id: ids.get(variantSignature(v.attributes)) ?? v.id })),
          };
        }
        return next;
      });
      setSavedKey(docKey({ ...snapshot, slug: snapshot.slug || result.slug }));
      setLastSavedAt(new Date());
      setSaveStatus('saved');
      setSaveError(null);

      if (wasNew) {
        try {
          localStorage.removeItem(PENDING_KEY);
        } catch {
          // ignore
        }
        // Swap the URL without a navigation: router.replace remounted the
        // builder and dropped anything typed while the save was in flight.
        window.history.replaceState(null, '', `/admin/products/${result.productId}`);
      }
    },
    []
  );

  const persistAutosave = useCallback(async () => {
    if (inFlight.current) return;
    const snapshot = docRef.current;
    const parsed = productDocumentSchema.safeParse(snapshot);
    if (!parsed.success || slugStatusRef.current === 'taken') {
      setSaveStatus('incomplete');
      return;
    }
    setSaveStatus('saving');
    const request = saveProductAction({
      productId: productIdRef.current,
      document: parsed.data,
      autosave: true,
    });
    inFlight.current = request;
    try {
      const result = await request;
      if (result.ok) applySaved(result, snapshot);
      else {
        setSaveStatus('error');
        setSaveError(result.error);
      }
    } catch (err) {
      console.error('Autosave failed:', err);
      setSaveStatus('error');
      setSaveError('Autosave failed — check your connection.');
    } finally {
      inFlight.current = null;
    }
  }, [applySaved]);

  useEffect(() => {
    if (!dirty) return;
    if (!productId) {
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(doc));
      } catch {
        // Storage full or blocked — the server autosave still applies.
      }
    }
    if (!autosaveEnabled) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(persistAutosave, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [doc, dirty, savedKey, productId, autosaveEnabled, persistAutosave]);

  // Warn before leaving with edits that are not on the server.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // ── Explicit save ──────────────────────────────────────

  const showFieldErrors = useCallback(
    (all: Record<string, string[]>, title: string) => {
      setErrors(all);
      const section = firstBrokenSection(all);
      if (section) setActiveSection(section);
      toast({
        title,
        description: section
          ? `See the ${SECTIONS.find((s) => s.id === section)?.label} section.`
          : Object.values(all)[0]?.[0],
        variant: 'destructive',
      });
    },
    [toast]
  );

  const save = useCallback(async (): Promise<string | null> => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaving(true);
    try {
      // Never race an autosave: two concurrent creates make two products.
      if (inFlight.current) await inFlight.current.catch(() => {});

      const snapshot = docRef.current;
      const parsed = productDocumentSchema.safeParse(snapshot);
      if (!parsed.success) {
        showFieldErrors(flattenIssues(parsed), 'Please fix the highlighted fields');
        return null;
      }
      if (slugStatusRef.current === 'taken') {
        showFieldErrors({ slug: ['Already used by another product — pick another'] }, 'URL slug is taken');
        return null;
      }

      setSaveStatus('saving');
      const result = await saveProductAction({
        productId: productIdRef.current,
        document: parsed.data,
      });
      if (!result.ok) {
        setSaveStatus('error');
        setSaveError(result.error);
        if (result.fieldErrors) showFieldErrors(result.fieldErrors, result.error);
        else toast({ title: 'Failed to save product', description: result.error, variant: 'destructive' });
        return null;
      }
      applySaved(result, snapshot);
      setErrors({});
      toast({
        title:
          result.status === 'published'
            ? 'Product saved — live on the store'
            : result.status === 'scheduled'
              ? 'Product scheduled'
              : 'Product saved',
      });
      return result.productId;
    } catch (err: any) {
      setSaveStatus('error');
      toast({
        title: 'Failed to save product',
        description: err?.message || 'Something went wrong.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setSaving(false);
    }
  }, [applySaved, showFieldErrors, toast]);

  // ── Media upload ───────────────────────────────────────

  const uploadImages = useCallback(
    async (files: File[]): Promise<string[]> => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
      const valid = files.filter((f) => allowed.includes(f.type) && f.size <= 5 * 1024 * 1024);
      const rejected = files.length - valid.length;
      if (rejected > 0) {
        toast({
          title: `${rejected} file(s) skipped`,
          description: 'Allowed: jpg, png, webp, avif up to 5 MB each.',
          variant: 'destructive',
        });
      }

      // The upload route takes 10 files per request; send larger drops in
      // batches instead of failing the whole selection.
      const urls: string[] = [];
      for (let i = 0; i < valid.length; i += UPLOAD_BATCH) {
        const form = new FormData();
        valid.slice(i, i + UPLOAD_BATCH).forEach((f) => form.append('files', f));
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Upload failed');
        }
        const data = await res.json();
        urls.push(...((data.urls as string[]) || []));
      }
      return urls;
    },
    [toast]
  );

  const [uploading, setUploading] = useState(false);
  const addImages = useCallback(
    async (files: File[]) => {
      setUploading(true);
      try {
        const urls = await uploadImages(files);
        if (urls.length > 0) {
          update((d) => {
            d.images.push(...urls.filter((u) => !d.images.includes(u)));
          });
        }
      } catch (err: any) {
        toast({
          title: 'Upload failed',
          description: err?.message || 'Could not upload images.',
          variant: 'destructive',
        });
      } finally {
        setUploading(false);
      }
    },
    [uploadImages, update, toast]
  );

  // ── Preview mapping ────────────────────────────────────

  const previewProduct: Product = useMemo(() => {
    const { sizes, colors } = deriveStorefrontOptions(doc);
    const isVariable = doc.productType === 'variable';
    const stockQuantity =
      isVariable && doc.manageStock
        ? doc.variants.reduce((n, v) => n + v.stockQuantity, 0)
        : doc.stockQuantity;
    const inStock = !doc.manageStock && !isVariable
      ? doc.inStock
      : isVariable && !doc.manageStock
        ? doc.variants.some((v) => v.inStock)
        : stockQuantity > 0 || doc.backorderPolicy !== 'no';
    return {
      id: productId || 'preview',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      name: doc.name || 'Untitled product',
      slug: doc.slug || 'preview',
      description: doc.description,
      shortDescription: doc.shortDescription || 'Short description preview.',
      price: parseFloat(doc.price || '0') || 0,
      compareAtPrice: doc.compareAtPrice ? parseFloat(doc.compareAtPrice) : undefined,
      // The builder holds ids, not names. Resolving them here would mean a
      // fetch inside a memo; the preview exists to show layout and imagery.
      category: null,
      images: doc.images,
      colors,
      sizes,
      tags: [],
      featured: doc.featured,
      newArrivalPinned: doc.newArrivalPinned,
      excludeFromNewArrivals: doc.excludeFromNewArrivals,
      imageMeta: {},
      inStock,
      stockQuantity,
      sku: doc.sku || 'SKU-PREVIEW',
      weight: doc.weight ? parseFloat(doc.weight) : undefined,
      dimensions: undefined,
      similarProducts: doc.similarProductIds,
      productType: doc.productType,
      status: doc.status,
      visibility: doc.visibility,
      publishedAt: undefined,
      saleStartsAt: doc.saleStartsAt ?? undefined,
      saleEndsAt: doc.saleEndsAt ?? undefined,
      manageStock: doc.manageStock,
      backorderPolicy: doc.backorderPolicy,
      lowStockThreshold: doc.lowStockThreshold,
      shippingClass: doc.shippingClass || undefined,
      lengthIn: doc.lengthIn ? parseFloat(doc.lengthIn) : undefined,
      widthIn: doc.widthIn ? parseFloat(doc.widthIn) : undefined,
      heightIn: doc.heightIn ? parseFloat(doc.heightIn) : undefined,
      taxClass: doc.taxClass || undefined,
      metaTitle: doc.metaTitle || undefined,
      metaDescription: doc.metaDescription || undefined,
      ogImage: doc.ogImage || undefined,
      upsellIds: doc.upsellIds,
      crossSellIds: doc.crossSellIds,
      imageAlts: doc.imageAlts,
    };
  }, [doc, productId]);

  return {
    doc,
    update,
    errors,
    productId,
    persistedStatus,
    dirty,
    autosaveEnabled,
    saveStatus,
    saveError,
    lastSavedAt,
    saving,
    save,
    navigateTo,
    sectionComplete,
    sectionVisited,
    activeSection,
    slugStatus,
    setName,
    setSlug,
    addImages,
    uploading,
    discardLocalDraft,
    previewProduct,
    previewOpen,
    setPreviewOpen,
  };
}
