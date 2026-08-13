import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(price);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

/**
 * Single resolver for every product image URL in the app.
 *
 * Accepted inputs:
 * - absolute URLs (http/https) and blob: pass through untouched
 * - root-relative paths (/images/products/x.jpg seeded, /api/media/x
 *   uploaded) pass through untouched
 * - bare filenames resolve to /uploads/<name> (legacy fallback only —
 *   nothing writes this shape anymore)
 *
 * Returns '' for empty input so callers can treat it as "no image".
 */
export function getImageUrl(fileName: string | null | undefined): string {
  if (!fileName) return '';
  if (
    fileName.startsWith('http://') ||
    fileName.startsWith('https://') ||
    fileName.startsWith('blob:') ||
    fileName.startsWith('/')
  ) {
    return fileName;
  }
  return `/uploads/${fileName}`;
}

/**
 * Validates an image src for next/image. Returns the resolved URL when it
 * can be rendered (same-origin path or absolute URL), null otherwise.
 */
export function getValidImageSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.startsWith('blob:')) return src;
  if (src.startsWith('/')) return src;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return null;
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function generateOrderId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ORD-${timestamp}-${random}`.toUpperCase();
}

export const CATEGORIES = {
  men: {
    label: 'Men',
    subcategories: ['Thobes', 'Kurtas', 'Jubbas', 'Caps/Kufis', 'Pants'],
  },
  women: {
    label: 'Women',
    subcategories: ['Abayas', 'Hijabs', 'Khimars', 'Jilbabs', 'Dresses'],
  },
  accessories: {
    label: 'Accessories',
    subcategories: ['Miswak', 'Attar/Perfumes', 'Prayer Mats', 'Tasbeeh', 'Bags'],
  },
} as const;

export const COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Navy', value: '#345995' },
  { name: 'Sage', value: '#b5c1a0' },
  { name: 'Mocha', value: '#7b5e57' },
  { name: 'Rose', value: '#d4a3a3' },
  { name: 'Gold', value: '#eedbb4' },
  { name: 'Beige', value: '#F5F5DC' },
  { name: 'Gray', value: '#808080' },
  { name: 'Brown', value: '#8B4513' },
] as const;

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'] as const;
