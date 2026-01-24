'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Save, Eye, LayoutGrid, Upload, X, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createProduct, updateProduct } from '@/lib/pocketbase';
import ProductCard from '@/components/product/product-card';
import type { Product, ProductColor } from '@/types';
import { getImageUrl } from '@/lib/utils';

// Form data type with proper defaults
type ProductFormData = {
  name: string;
  price: number;
  compareAtPrice: number;
  description: string;
  shortDescription: string;
  category: string;
  subcategory: string;
  stockQuantity: number;
  inStock: boolean;
  featured: boolean;
  images: string[];
  colors: ProductColor[];
  sizes: string[];
  tags: string[];
  sku: string;
  slug?: string;
  imageFiles?: File[];
};

interface ProductEditorProps {
  initialData?: Product;
}

// Helper to get default values
function getDefaultFormData(initialData?: Product): ProductFormData {
  return {
    name: initialData?.name ?? 'New Product',
    price: initialData?.price ?? 0,
    compareAtPrice: initialData?.compareAtPrice ?? 0,
    description: initialData?.description ?? 'Product description goes here.',
    shortDescription: initialData?.shortDescription ?? 'Short description for the card view',
    category: initialData?.category ?? 'men',
    subcategory: initialData?.subcategory ?? 'General',
    stockQuantity: initialData?.stockQuantity ?? 10,
    inStock: initialData?.inStock ?? true,
    featured: initialData?.featured ?? false,
    images: initialData?.images ?? [],
    colors: initialData?.colors ?? [],
    sizes: initialData?.sizes ?? ['S', 'M', 'L', 'XL'],
    tags: initialData?.tags ?? [],
    sku: initialData?.sku ?? 'SKU-001',
    slug: initialData?.slug ?? '',
    imageFiles: [],
  };
}

export default function ProductEditor({ initialData }: ProductEditorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<'card' | 'page'>('card');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form State with proper defaults
  const [formData, setFormData] = useState<ProductFormData>(() => getDefaultFormData(initialData));

  // Preview Image URLs (for local files)
  const [previewImages, setPreviewImages] = useState<string[]>([]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? 0 : parseFloat(value)) : value
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSwitchChange = (name: string, checked: boolean) => {
    setFormData(prev => ({ ...prev, [name]: checked }));
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);
    const newPreviews = newFiles.map(file => URL.createObjectURL(file));

    setFormData(prev => ({
      ...prev,
      imageFiles: [...(prev.imageFiles || []), ...newFiles]
    }));
    setPreviewImages(prev => [...prev, ...newPreviews]);
  };

  // Remove an image
  const removeImage = (index: number, isExisting: boolean) => {
    if (isExisting) {
      // Remove from existing images
      setFormData(prev => ({
        ...prev,
        images: prev.images.filter((_, i) => i !== index)
      }));
    } else {
      // Remove from new uploads
      const adjustedIndex = index - formData.images.length;
      setFormData(prev => ({
        ...prev,
        imageFiles: (prev.imageFiles || []).filter((_, i) => i !== adjustedIndex)
      }));
      // Also revoke the preview URL
      URL.revokeObjectURL(previewImages[adjustedIndex]);
      setPreviewImages(prev => prev.filter((_, i) => i !== adjustedIndex));
    }
  };

  // Get image URL for display
  const getDisplayImageUrl = (image: string) => {
    if (initialData?.id && initialData?.collectionId) {
      return getImageUrl(initialData.collectionId, initialData.id, image);
    }
    return '/placeholder.jpg';
  };

  // Construct preview images - combine existing (with PocketBase URLs) and new uploads (with blob URLs)
  const getPreviewImageUrls = (): string[] => {
    const existingImageUrls = (initialData?.id && initialData?.collectionId)
      ? formData.images.map(img => getImageUrl(initialData.collectionId, initialData.id, img))
      : [];
    const newUploadUrls = previewImages;
    return [...existingImageUrls, ...newUploadUrls];
  };

  // Mock product for preview
  const previewProduct: Product = {
    ...formData,
    id: initialData?.id || 'preview',
    collectionId: initialData?.collectionId || 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    // Use actual preview URLs for images (both existing and newly uploaded)
    images: getPreviewImageUrls(),
    colors: formData.colors || [],
    sizes: formData.sizes || [],
    tags: formData.tags || [],
    sku: formData.sku || 'SKU-PREVIEW',
    description: formData.description || '',
    shortDescription: formData.shortDescription || '',
    name: formData.name || 'Untitled Product',
    price: formData.price || 0,
    category: formData.category || 'men',
    subcategory: formData.subcategory || 'General',
    similarProducts: [],
  } as unknown as Product;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // Client-side validation for required fields
    const errors: string[] = [];
    if (!formData.name || formData.name.length < 2) errors.push('Name is required (min 2 characters)');
    if (!formData.description) errors.push('Description is required');
    if (!formData.shortDescription) errors.push('Short Description is required');
    if (!formData.subcategory) errors.push('Subcategory is required');
    if (!formData.sku) errors.push('SKU is required');
    if (formData.price <= 0) errors.push('Price must be greater than 0');
    
    if (errors.length > 0) {
      alert('Please fix the following errors:\n\n' + errors.join('\n'));
      setSaving(false);
      return;
    }

    try {
      const data = new FormData();
      // Append basic fields
      data.append('name', formData.name);
      data.append('price', String(formData.price));
      data.append('compareAtPrice', String(formData.compareAtPrice || 0));
      data.append('description', formData.description);
      data.append('shortDescription', formData.shortDescription);
      data.append('category', formData.category);
      data.append('subcategory', formData.subcategory);
      data.append('stockQuantity', String(formData.stockQuantity));
      data.append('inStock', String(formData.inStock));
      data.append('featured', String(formData.featured));
      data.append('sku', formData.sku);

      // Handle JSON fields
      data.append('colors', JSON.stringify(formData.colors));
      data.append('sizes', JSON.stringify(formData.sizes));
      data.append('tags', JSON.stringify(formData.tags));
      
      // Auto-generate slug if missing
      const slug = formData.slug || formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      data.append('slug', slug);

      // Handle Image File Uploads
      if (formData.imageFiles && formData.imageFiles.length > 0) {
        for (const file of formData.imageFiles) {
          data.append('images', file);
        }
      }
      
      if (initialData?.id) {
        await updateProduct(initialData.id, data);
      } else {
        await createProduct(data);
      }
      
      router.push('/admin/products');
    } catch (err: any) {
      console.error(err);
      // Try to show more specific error message
      let errorMessage = 'Failed to save product.';
      // PocketBase returns errors in err.data.data (nested)
      const fieldData = err?.data?.data || err?.response?.data;
      if (fieldData && typeof fieldData === 'object') {
        const fieldErrors = Object.entries(fieldData)
          .map(([field, error]: [string, any]) => `${field}: ${error?.message || JSON.stringify(error)}`)
          .join('\n');
        if (fieldErrors) {
          errorMessage += '\n\nField errors:\n' + fieldErrors;
        }
      } else if (err?.message) {
        errorMessage += '\n\n' + err.message;
      }
      console.error('Full error details:', JSON.stringify(err?.data, null, 2));
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // Calculate all images to display
  const allImages = [
    ...formData.images.map((img, i) => ({ url: getDisplayImageUrl(img), isExisting: true, index: i })),
    ...previewImages.map((url, i) => ({ url, isExisting: false, index: formData.images.length + i }))
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-4 md:-m-8"> 
      {/* Left Panel: Editor */}
      <div className="w-1/2 border-r bg-background flex flex-col">
        <div className="p-4 border-b flex items-center justify-between bg-muted/10">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h2 className="font-semibold">Product Editor</h2>
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-8">
            {/* Basic Info */}
            <section className="space-y-4">
              <h3 className="text-lg font-heading font-semibold">Basic Info</h3>
              <div className="space-y-2">
                <Label>Product Name</Label>
                <Input name="name" value={formData.name} onChange={handleInputChange} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price ($)</Label>
                  <Input type="number" name="price" value={formData.price} onChange={handleInputChange} min={0} step={0.01} />
                </div>
                <div className="space-y-2">
                  <Label>Compare Price ($)</Label>
                  <Input type="number" name="compareAtPrice" value={formData.compareAtPrice} onChange={handleInputChange} min={0} step={0.01} />
                </div>
              </div>
            </section>

            <Separator />

            {/* Product Images */}
            <section className="space-y-4">
              <h3 className="text-lg font-heading font-semibold">Product Images</h3>
              <div className="space-y-4">
                {/* Image Grid */}
                <div className="grid grid-cols-3 gap-4">
                  {allImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg border overflow-hidden group">
                      <img 
                        src={img.url} 
                        alt={`Product ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(img.index, img.isExisting)}
                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      {img.isExisting && (
                        <span className="absolute bottom-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded">
                          Saved
                        </span>
                      )}
                    </div>
                  ))}
                  
                  {/* Upload Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
                  >
                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Add Image</span>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <p className="text-sm text-muted-foreground">
                  Upload product images. First image will be the main product image.
                </p>
              </div>
            </section>

            <Separator />

            {/* Categorization */}
            <section className="space-y-4">
              <h3 className="text-lg font-heading font-semibold">Categorization</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(val) => handleSelectChange('category', val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="men">Men</SelectItem>
                      <SelectItem value="women">Women</SelectItem>
                      <SelectItem value="accessories">Accessories</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subcategory</Label>
                  <Input name="subcategory" value={formData.subcategory} onChange={handleInputChange} list="subcategories" />
                  <datalist id="subcategories">
                    <option value="Thobes" />
                    <option value="Abayas" />
                    <option value="Hijabs" />
                    <option value="Kufis" />
                  </datalist>
                </div>
              </div>
            </section>

            <Separator />
            
            {/* Description */}
            <section className="space-y-4">
              <h3 className="text-lg font-heading font-semibold">Details</h3>
              <div className="space-y-2">
                <Label>Short Description</Label>
                <Textarea 
                  name="shortDescription" 
                  value={formData.shortDescription} 
                  onChange={handleInputChange} 
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Full Description (Markdown supported)</Label>
                <Textarea 
                  name="description" 
                  value={formData.description} 
                  onChange={handleInputChange} 
                  className="min-h-[150px]"
                />
              </div>
            </section>
            
            <Separator />
            
             {/* Inventory */}
             <section className="space-y-4">
              <h3 className="text-lg font-heading font-semibold">Inventory</h3>
              <div className="flex items-center justify-between border p-4 rounded-md">
                <div className="space-y-0.5">
                  <Label>In Stock</Label>
                  <p className="text-sm text-muted-foreground">Is this product available?</p>
                </div>
                <Switch 
                  checked={formData.inStock} 
                  onCheckedChange={(checked) => handleSwitchChange('inStock', checked)} 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input name="sku" value={formData.sku} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input type="number" name="stockQuantity" value={formData.stockQuantity} onChange={handleInputChange} min={0} />
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel: Live Preview */}
      <div className="w-1/2 bg-muted/30 flex flex-col">
        <div className="p-4 border-b flex items-center justify-between bg-background">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Live Preview</span>
          </div>
          <Tabs value={previewMode} onValueChange={(v) => setPreviewMode(v as 'card' | 'page')} className="w-[200px]">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="card"><LayoutGrid className="h-4 w-4 mr-2" /> Card</TabsTrigger>
              <TabsTrigger value="page">Page</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        <ScrollArea className="flex-1">
          {previewMode === 'card' ? (
            <div className="flex items-center justify-center p-8">
              <div className="w-full max-w-xs transform scale-110">
                <ProductCard product={previewProduct} index={0} />
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Page Preview - Simulates product detail page */}
              <div className="bg-background rounded-lg border shadow-sm overflow-hidden">
                {/* Product Image */}
                {getPreviewImageUrls().length > 0 ? (
                  <div className="aspect-square relative bg-muted">
                    <img 
                      src={getPreviewImageUrls()[0]} 
                      alt={formData.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-square bg-muted flex items-center justify-center text-muted-foreground">
                    No image
                  </div>
                )}
                
                <div className="p-4 space-y-4">
                  {/* Category & SKU */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                    <span>{formData.subcategory || formData.category}</span>
                    {formData.sku && (
                      <>
                        <span>•</span>
                        <span>SKU: {formData.sku}</span>
                      </>
                    )}
                  </div>
                  
                  {/* Name */}
                  <h2 className="text-xl font-semibold">{formData.name || 'Product Name'}</h2>
                  
                  {/* Price */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-primary">${formData.price.toFixed(2)}</span>
                    {formData.compareAtPrice > formData.price && (
                      <span className="text-lg text-muted-foreground line-through">${formData.compareAtPrice.toFixed(2)}</span>
                    )}
                  </div>
                  
                  {/* Short Description */}
                  {formData.shortDescription && (
                    <p className="text-muted-foreground">{formData.shortDescription}</p>
                  )}
                  
                  {/* Stock Status */}
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${formData.inStock ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span className="text-sm">{formData.inStock ? 'In Stock' : 'Out of Stock'}</span>
                    {formData.stockQuantity > 0 && (
                      <span className="text-sm text-muted-foreground">({formData.stockQuantity} available)</span>
                    )}
                  </div>
                  
                  {/* Sizes */}
                  {formData.sizes.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-sm font-medium">Sizes:</span>
                      <div className="flex flex-wrap gap-2">
                        {formData.sizes.map(size => (
                          <span key={size} className="px-3 py-1 border rounded text-sm">{size}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Full Description */}
                  {formData.description && (
                    <div className="pt-4 border-t space-y-2">
                      <h3 className="font-medium">Description</h3>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {formData.description}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
        
        <div className="p-4 border-t bg-background text-xs text-muted-foreground text-center">
           {previewMode === 'card' ? 'Card view as shown in shop listings' : 'Page view as shown on product detail page'}
        </div>
      </div>
    </div>
  );
}
