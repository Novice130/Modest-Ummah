import { fetchBuilderProduct } from '@/lib/actions/product.actions';
import ProductBuilderClient from '@/components/admin/product-builder/product-builder-client';

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;

  const data = await fetchBuilderProduct(id);

  if (!data) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Product not found
      </div>
    );
  }

  return (
    <ProductBuilderClient
      init={{
        productId: id,
        product: data.product,
        variants: data.variants as any,
        attributes: data.attributes,
      }}
    />
  );
}
