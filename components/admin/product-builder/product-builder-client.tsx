'use client';

import ProductBuilder from './index';
import { useProductBuilder, type BuilderInit } from './use-product-builder';

/**
 * Client container: receives the initial server-loaded data once, hands it
 * to the builder state hook. Keeps server components thin.
 */
export default function ProductBuilderClient({ init }: { init: BuilderInit }) {
  const builder = useProductBuilder(init);
  return <ProductBuilder builder={builder} isNew={!init.productId} />;
}
