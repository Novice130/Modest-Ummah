/**
 * Matching a shopper's Size/Color picks to a product variant. Directive-free
 * and dependency-free: the product page (client), the pricing resolver and the
 * inventory writer all use it, so what is shown, charged and decremented
 * cannot disagree.
 */

/** Which storefront picker a variation option feeds, by its name. */
export function optionKind(name: string): 'size' | 'color' | null {
  const n = name.trim().toLowerCase();
  if (/^sizes?$/.test(n)) return 'size';
  if (/^colou?rs?$/.test(n)) return 'color';
  return null;
}

export interface OptionPicks {
  size?: string | null;
  color?: string | null;
}

/**
 * The one variant whose every attribute is named by the picks. Undefined when
 * none match or the picks are ambiguous. A variant with an option that is
 * neither size nor color cannot be picked on the storefront, so never matches.
 */
export function findVariantByOptions<T extends { attributes: Record<string, string> | null }>(
  variants: T[],
  picks: OptionPicks
): T | undefined {
  const matches = variants.filter((v) => {
    const entries = Object.entries(v.attributes || {});
    return (
      entries.length > 0 &&
      entries.every(([name, value]) => {
        const kind = optionKind(name);
        return kind === 'size' ? value === picks.size : kind === 'color' ? value === picks.color : false;
      })
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
}

/** The Size/Color a variant actually is, from its own attributes. */
export function variantOptions(attributes: Record<string, string> | null | undefined): {
  size?: string;
  color?: string;
} {
  const options: { size?: string; color?: string } = {};
  for (const [name, value] of Object.entries(attributes || {})) {
    const kind = optionKind(name);
    if (kind) options[kind] = value;
  }
  return options;
}
