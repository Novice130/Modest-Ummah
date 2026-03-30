import { fetchProductBySlugOrId } from '@/lib/actions/product.actions';
import ProductEditor from '@/components/admin/product-editor';

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  
  let product = null;
  try {
     product = await fetchProductBySlugOrId(id);
  } catch(e) {
     console.error(e);
  }

  if (!product) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Product not found
      </div>
    );
  }

  return <ProductEditor initialData={product} />;
}
