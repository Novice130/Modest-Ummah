'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { createProduct, updateProduct } from '@/lib/pocketbase';
import { CATEGORIES, COLORS, SIZES } from '@/lib/utils';
import type { Product } from '@/types';

const productSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  slug: z.string().min(2, 'Slug is required'),
  description: z.string().min(10, 'Description is required'),
  shortDescription: z.string().min(10, 'Short description is required'),
  price: z.number().min(0.01, 'Price must be greater than 0'),
  compareAtPrice: z.number().optional(),
  category: z.enum(['men', 'women', 'accessories']),
  subcategory: z.string().min(1, 'Subcategory is required'),
  sku: z.string().min(1, 'SKU is required'),
  stockQuantity: z.number().min(0),
  featured: z.boolean(),
  inStock: z.boolean(),
  tags: z.array(z.string()),
  sizes: z.array(z.string()),
  colors: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
  product?: Product;
}

export default function ProductForm({ product }: ProductFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [tagInput, setTagInput] = useState('');

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: product ? {
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      category: product.category,
      subcategory: product.subcategory,
      sku: product.sku,
      stockQuantity: product.stockQuantity,
      featured: product.featured,
      inStock: product.inStock,
      tags: product.tags || [],
      sizes: product.sizes || [],
      colors: product.colors || [],
    } : {
      featured: false,
      inStock: true,
      stockQuantity: 0,
      tags: [],
      sizes: [],
      colors: [],
    },
  });

  const { fields: colorFields, append: appendColor, remove: removeColor } = useFieldArray({
    control,
    name: 'colors',
  });

  const selectedCategory = watch('category');
  const tags = watch('tags');
  const sizes = watch('sizes');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages(Array.from(e.target.files));
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setValue('tags', [...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setValue('tags', tags.filter(tag => tag !== tagToRemove));
  };

  const toggleSize = (size: string) => {
    if (sizes.includes(size)) {
      setValue('sizes', sizes.filter(s => s !== size));
    } else {
      setValue('sizes', [...sizes, size]);
    }
  };

  const onSubmit = async (data: ProductFormData) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      
      Object.entries(data).forEach(([key, value]) => {
        if (key === 'colors' || key === 'tags' || key === 'sizes') {
          formData.append(key, JSON.stringify(value));
        } else if (value !== undefined) {
          formData.append(key, String(value));
        }
      });

      images.forEach((image) => {
        formData.append('images', image);
      });

      if (product) {
        await updateProduct(product.id, formData);
        toast({
          title: 'Product updated!',
          description: 'The product has been successfully updated.',
        });
      } else {
        await createProduct(formData);
        toast({
          title: 'Product created!',
          description: 'The product has been successfully created.',
        });
      }

      router.push('/admin/products');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save product.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input id="name" {...register('name')} />
                  {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <Input id="slug" {...register('slug')} />
                  {errors.slug && <p className="text-sm text-red-500">{errors.slug.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shortDescription">Short Description</Label>
                <Input id="shortDescription" {...register('shortDescription')} />
                {errors.shortDescription && <p className="text-sm text-red-500">{errors.shortDescription.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Full Description</Label>
                <textarea
                  id="description"
                  {...register('description')}
                  className="w-full min-h-[150px] px-3 py-2 border rounded-md resize-y"
                  placeholder="Use HTML for formatting..."
                />
                {errors.description && <p className="text-sm text-red-500">{errors.description.message}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Images</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  Drag and drop images or click to upload
                </p>
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="max-w-xs mx-auto"
                />
              </div>
              {images.length > 0 && (
                <div className="flex gap-2 mt-4">
                  {images.map((image, index) => (
                    <div key={index} className="relative w-20 h-20 bg-muted rounded">
                      <span className="text-xs">{image.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Variants</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Colors */}
              <div className="space-y-3">
                <Label>Colors</Label>
                <div className="space-y-2">
                  {colorFields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-2">
                      <Input
                        placeholder="Color name"
                        {...register(`colors.${index}.name`)}
                      />
                      <Input
                        type="color"
                        className="w-20 p-1 h-10"
                        {...register(`colors.${index}.value`)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeColor(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendColor({ name: '', value: '#000000' })}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Color
                </Button>
              </div>

              {/* Sizes */}
              <div className="space-y-3">
                <Label>Sizes</Label>
                <div className="flex flex-wrap gap-2">
                  {SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => toggleSize(size)}
                      className={`px-3 py-1 text-sm border rounded-md transition-all ${
                        sizes.includes(size)
                          ? 'bg-sage-300 text-navy-900 border-sage-400'
                          : 'border-gray-300 hover:border-sage-300'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="price">Price ($)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  {...register('price', { valueAsNumber: true })}
                />
                {errors.price && <p className="text-sm text-red-500">{errors.price.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="compareAtPrice">Compare at Price ($)</Label>
                <Input
                  id="compareAtPrice"
                  type="number"
                  step="0.01"
                  {...register('compareAtPrice', { valueAsNumber: true })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  defaultValue={product?.category}
                  onValueChange={(value) => setValue('category', value as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(([key, cat]) => (
                      <SelectItem key={key} value={key}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCategory && (
                <div className="space-y-2">
                  <Label>Subcategory</Label>
                  <Select
                    defaultValue={product?.subcategory}
                    onValueChange={(value) => setValue('subcategory', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subcategory" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES[selectedCategory as keyof typeof CATEGORIES]?.subcategories.map((sub) => (
                        <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" {...register('sku')} />
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    placeholder="Add tag"
                  />
                  <Button type="button" onClick={addTag} size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 bg-sage-100 text-sage-700 px-2 py-1 rounded text-xs"
                    >
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stockQuantity">Stock Quantity</Label>
                <Input
                  id="stockQuantity"
                  type="number"
                  {...register('stockQuantity', { valueAsNumber: true })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="inStock"
                  checked={watch('inStock')}
                  onCheckedChange={(checked) => setValue('inStock', checked as boolean)}
                />
                <Label htmlFor="inStock">In Stock</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="featured"
                  checked={watch('featured')}
                  onCheckedChange={(checked) => setValue('featured', checked as boolean)}
                />
                <Label htmlFor="featured">Featured Product</Label>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Product'
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
