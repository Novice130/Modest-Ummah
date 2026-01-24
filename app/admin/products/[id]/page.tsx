import { getProduct } from '@/lib/pocketbase';
import ProductEditor from '@/components/admin/product-editor';

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  
  // Fetch data on server
  let product = null;
  try {
     product = await getProduct(id);
  } catch(e) {
     return <div>Product not found</div>;
  }

  return <ProductEditor initialData={product} />;
}
