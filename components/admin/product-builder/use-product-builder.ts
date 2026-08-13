'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  productDocumentSchema,
  flattenIssues,
  SECTIONS,
  type ProductDocument,
  type SectionId,
} from '@/lib/product-builder-schema';
import { saveProductAction, checkSlugAvailable } from '@/lib/actions/product.actions';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/types';
import type { ProductAttributeSelect } from '@/lib/schema';

/**
 * Builder state machine: one product document, per-section Zod validation,
 * server-side draft autosave (debounced), image upload, and the preview
 * Product mapping. localStorage is only a fallback while the row does not
 * exist yet on the server.
 */

export interface BuilderInit {
  productId?: string;
  product?: Product | null;
  variants?: Array<{
    id: string;
    sku: string;
    attributes: Record<string, string>;
    price: string | null;
    compareAtPrice: string | null;
    stockQuantity: number;
    inStock: boolean;
    image: string | null;
    weight: string | null;
    position: number;
  }>;
  attributes?: ProductAttributeSelect[];
}

/** Section field prefixes — zod paths are joined with '.' */
export const SECTION_FIELDS: Record<SectionId, string[]> = {
  basics: ['name', 'slug', 'productType', 'shortDescription', 'description'],
  media: ['images', 'imageAlts'],
  organization: [
    'category',
    'subcategory',
    'tags',
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
    'variants',
  ],
  inventory: ['sku', 'manageStock', 'stockQuantity', 'backorderPolicy', 'lowStockThreshold', 'weight', 'lengthIn', 'widthIn', 'heightIn', 'shippingClass'],
  publish: ['metaTitle', 'metaDescription', 'ogImage', 'status', 'publishAt'],
};

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useProductBuilder(init: BuilderInit) {
  const router = useRouter();
  const { toast } = useToast();

  const [doc, setDoc] = useState<ProductDocument>(() => initialDocument(init));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [productId, setProductId] = useState<string | null>(init.productId ?? null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [sectionVisited, setSectionVisited] = useState<Set<SectionId>>(new Set());
  const [activeSection, setActiveSection] = useState<SectionId>('basics');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [variantSelection, setVariantSelection] = useState<Set<string>>(new Set());

  const docRef = useRef(doc);
  docRef.current = doc;
  const productIdRef = useRef(productId);
  productIdRef.current = productId;
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveInFlight = useRef(false);
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markVisited = (section: SectionId) =>
    setSectionVisited((prev) => new Set(prev).add(section));

  const update = useCallback((fn: (draft: ProductDocument) => void) => {
    setDoc((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      return {};
    });
  }, []);

  const patch = useCallback(
    (partial: Partial<ProductDocument>) => {
      setDoc((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  // ── Validation ─────────────────────────────────────────

  const validateSection = useCallback(
    (section: SectionId): boolean => {
      const parsed = productDocumentSchema.safeParse(docRef.current);
      if (parsed.success) {
        setErrors({});
        return true;
      }
      const all = flattenIssues(parsed);
      const fields = SECTION_FIELDS[section];
      const scoped: Record<string, string[]> = {};
      for (const [key, messages] of Object.entries(all)) {
        if (fields.some((f) => key === f || key.startsWith(f + '.'))) {
          scoped[key] = messages;
        }
      }
      setErrors(scoped);
      return Object.keys(scoped).length === 0;
    },
    []
  );

  /** Completion state for the left nav: silently validate. */
  const sectionComplete = useCallback(
    (section: SectionId): boolean => {
      const parsed = productDocumentSchema.safeParse(doc);
      if (parsed.success) return true;
      const all = flattenIssues(parsed);
      const fields = SECTION_FIELDS[section];
      return !Object.entries(all).some(([key]) =>
        fields.some((f) => key === f || key.startsWith(f + '.'))
      );
    },
    [doc]
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

  // ── Slug handling ──────────────────────────────────────

  const touchSlug = useCallback((value: string) => {
    setSlugStatus('checking');
    if (slugTimer.current) clearTimeout(slugTimer.current);
    slugTimer.current = setTimeout(async () => {
      try {
        const available = await checkSlugAvailable(value, productIdRef.current ?? undefined);
        setSlugStatus(available ? 'available' : 'taken');
      } catch {
        setSlugStatus('idle');
      }
    }, 400);
  }, []);

  const slugifyName = useCallback((name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-');
    update((d) => {
      d.slug = slug;
    });
    touchSlug(slug);
  }, [update, touchSlug]);

  // ── Autosave (server drafts, localStorage only pre-row) ─

  const persistAutosave = useCallback(async () => {
    const snapshot = docRef.current;
    const id = productIdRef.current;
    autosaveInFlight.current = true;
    setSaveStatus('saving');
    try {
      const result = await saveProductAction({
        productId: id,
        document: snapshot,
        autosave: true,
      });
      setProductId(result.productId);
      setLastSavedAt(new Date());
      setSaveStatus('saved');
      if (!id) {
        // The first autosave creates the server draft row; move the URL so
        // refreshes keep editing the same product.
        router.replace(`/admin/products/${result.productId}`);
      }
      localStorage.removeItem('builder-draft-pending');
    } catch (err: any) {
      setSaveStatus('error');
      // Fallback: keep the pending document locally until the row exists.
      localStorage.setItem('builder-draft-pending', JSON.stringify(snapshot));
      console.error('Autosave failed:', err);
    } finally {
      autosaveInFlight.current = false;
    }
  }, [router]);

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      persistAutosave();
    }, 1500);
  }, [persistAutosave]);

  // Debounce writes after any doc change.
  useEffect(() => {
    scheduleAutosave();
  }, [doc, scheduleAutosave]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Explicit save ──────────────────────────────────────

  const save = useCallback(async (): Promise<string | null> => {
    setSaving(true);
    // Validate every section; jump to the first broken one.
    const parsed = productDocumentSchema.safeParse(docRef.current);
    if (!parsed.success) {
      const all = flattenIssues(parsed);
      setErrors(all);
      const order = SECTIONS.map((s) => s.id);
      const firstBroken = order.find((section) =>
        Object.keys(all).some((key) =>
          SECTION_FIELDS[section].some((f) => key === f || key.startsWith(f + '.'))
        )
      );
      if (firstBroken) {
        setActiveSection(firstBroken);
        toast({
          title: 'Please fix the highlighted fields',
          description: `The ${SECTIONS.find((s) => s.id === firstBroken)?.label} section has errors.`,
          variant: 'destructive',
        });
      }
      setSaving(false);
      return null;
    }

    try {
      setSaveStatus('saving');
      const result = await saveProductAction({
        productId: productIdRef.current,
        document: parsed.data,
      });
      setProductId(result.productId);
      setLastSavedAt(new Date());
      setSaveStatus('saved');
      setErrors({});
      if (!productIdRef.current) {
        router.replace(`/admin/products/${result.productId}`);
      }
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
  }, [router, toast]);

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
      if (valid.length === 0) return [];

      const form = new FormData();
      valid.forEach((f) => form.append('files', f));
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Upload failed');
      }
      const { urls } = await res.json();
      return urls as string[];
    },
    [toast]
  );

  const addImages = useCallback(
    async (files: File[]) => {
      try {
        const urls = await uploadImages(files);
        if (urls.length > 0) {
          update((d) => {
            d.images.push(...urls);
          });
        }
      } catch (err: any) {
        toast({
          title: 'Upload failed',
          description: err?.message || 'Could not upload images.',
          variant: 'destructive',
        });
      }
    },
    [uploadImages, update, toast]
  );

  // ── Preview mapping ────────────────────────────────────

  const previewProduct: Product = useMemo(() => {
    const firstImage = doc.images[0] || '';
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
      category: doc.category,
      subcategory: doc.subcategory || 'General',
      images: doc.images,
      colors: [],
      sizes: [],
      tags: doc.tags,
      featured: doc.featured,
      newArrivalPinned: doc.newArrivalPinned,
      excludeFromNewArrivals: doc.excludeFromNewArrivals,
      inStock: doc.stockQuantity > 0 || doc.variants.length > 0,
      stockQuantity: doc.stockQuantity,
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
    setDoc,
    update,
    patch,
    errors,
    setErrors,
    productId,
    saveStatus,
    lastSavedAt,
    saving,
    save,
    navigateTo,
    validateSection,
    sectionComplete,
    sectionVisited,
    activeSection,
    setActiveSection,
    markVisited,
    slugStatus,
    touchSlug,
    slugifyName,
    addImages,
    previewProduct,
    previewOpen,
    setPreviewOpen,
    variantSelection,
    setVariantSelection,
  };
}

function initialDocument(init: BuilderInit): ProductDocument {
  if (init.product) {
    return {
      name: init.product.name,
      slug: init.product.slug,
      productType: init.product.productType,
      shortDescription: init.product.shortDescription,
      description: init.product.description,
      images: init.product.images || [],
      imageAlts: init.product.imageAlts || {},
      category: init.product.category,
      subcategory: init.product.subcategory,
      tags: init.product.tags || [],
      featured: init.product.featured ?? false,
      newArrivalPinned: init.product.newArrivalPinned ?? false,
      excludeFromNewArrivals: init.product.excludeFromNewArrivals ?? false,
      visibility: init.product.visibility,
      upsellIds: init.product.upsellIds || [],
      crossSellIds: init.product.crossSellIds || [],
      similarProductIds: init.product.similarProducts || [],
      price: String(init.product.price),
      compareAtPrice: init.product.compareAtPrice != null ? String(init.product.compareAtPrice) : null,
      saleStartsAt: init.product.saleStartsAt ?? null,
      saleEndsAt: init.product.saleEndsAt ?? null,
      taxClass: init.product.taxClass || '',
      attributes: (init.attributes || []).map((a) => ({
        id: a.id,
        name: a.name,
        terms: (a.terms || []) as string[],
        usedForVariations: a.usedForVariations ?? false,
      })),
      variants: (init.variants || []).map((v) => ({
        id: v.id,
        sku: v.sku,
        attributes: (v.attributes || {}) as Record<string, string>,
        price: v.price != null ? String(parseFloat(v.price as string)) : null,
        compareAtPrice: v.compareAtPrice != null ? String(parseFloat(v.compareAtPrice as string)) : null,
        stockQuantity: v.stockQuantity ?? 0,
        inStock: v.inStock ?? true,
        image: v.image || undefined,
        weight: v.weight != null ? String(parseFloat(v.weight as string)) : null,
        position: v.position ?? 0,
      })),
      sku: init.product.sku,
      manageStock: init.product.manageStock ?? true,
      stockQuantity: init.product.stockQuantity ?? 0,
      backorderPolicy: init.product.backorderPolicy,
      lowStockThreshold: init.product.lowStockThreshold ?? 5,
      weight: init.product.weight != null ? String(init.product.weight) : null,
      lengthIn: init.product.lengthIn != null ? String(init.product.lengthIn) : null,
      widthIn: init.product.widthIn != null ? String(init.product.widthIn) : null,
      heightIn: init.product.heightIn != null ? String(init.product.heightIn) : null,
      shippingClass: init.product.shippingClass || '',
      metaTitle: init.product.metaTitle || '',
      metaDescription: init.product.metaDescription || '',
      ogImage: init.product.ogImage || '',
      status: init.product.status,
      publishAt: init.product.publishedAt ?? null,
    };
  }

  // First check localStorage for a not-yet-created product.
  try {
    const pending = localStorage.getItem('builder-draft-pending');
    if (pending) {
      const parsed = productDocumentSchema.safeParse(JSON.parse(pending));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // ignore
  }

  return {
    name: '',
    slug: '',
    productType: 'simple',
    shortDescription: '',
    description: '',
    images: [],
    imageAlts: {},
    category: 'men',
    subcategory: '',
    tags: [],
    featured: false,
    newArrivalPinned: false,
    excludeFromNewArrivals: false,
    visibility: 'public',
    upsellIds: [],
    crossSellIds: [],
    similarProductIds: [],
    price: '',
    compareAtPrice: null,
    saleStartsAt: null,
    saleEndsAt: null,
    taxClass: '',
    attributes: [],
    variants: [],
    sku: '',
    manageStock: true,
    stockQuantity: 0,
    backorderPolicy: 'no',
    lowStockThreshold: 5,
    weight: null,
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    shippingClass: '',
    metaTitle: '',
    metaDescription: '',
    ogImage: '',
    status: 'draft',
    publishAt: null,
  };
}
