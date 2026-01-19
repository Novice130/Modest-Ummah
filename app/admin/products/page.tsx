import Link from 'next/link';
import Image from 'next/image';
import { Plus, Search, Edit, Trash2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatPrice } from '@/lib/utils';

// Mock products
const products = [
  {
    id: '1',
    name: 'Premium White Thobe',
    sku: 'THB-001',
    category: 'men',
    price: 89.99,
    stock: 50,
    status: 'active',
    image: '/images/products/thobe-1.jpg',
  },
  {
    id: '2',
    name: 'Elegant Black Abaya',
    sku: 'ABY-001',
    category: 'women',
    price: 129.99,
    stock: 35,
    status: 'active',
    image: '/images/products/abaya-1.jpg',
  },
  {
    id: '3',
    name: 'Premium Hijab Set',
    sku: 'HJB-001',
    category: 'women',
    price: 24.99,
    stock: 100,
    status: 'active',
    image: '/images/products/hijab-1.jpg',
  },
  {
    id: '4',
    name: 'Natural Miswak (5 Pack)',
    sku: 'MSK-001',
    category: 'accessories',
    price: 12.99,
    stock: 200,
    status: 'active',
    image: '/images/products/miswak-1.jpg',
  },
  {
    id: '5',
    name: 'Embroidered Kufi Cap',
    sku: 'KUF-001',
    category: 'men',
    price: 19.99,
    stock: 0,
    status: 'out_of_stock',
    image: '/images/products/kufi-1.jpg',
  },
  {
    id: '6',
    name: 'Arabian Oud Attar',
    sku: 'ATR-001',
    category: 'accessories',
    price: 49.99,
    stock: 45,
    status: 'active',
    image: '/images/products/attar-1.jpg',
  },
];

export default function AdminProductsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-heading text-3xl">Products</h1>
          <p className="text-muted-foreground">Manage your product inventory</p>
        </div>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." className="pl-10" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="men">Men</SelectItem>
                <SelectItem value="women">Women</SelectItem>
                <SelectItem value="accessories">Accessories</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Product</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">SKU</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Category</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Price</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Stock</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-muted rounded-md shrink-0 overflow-hidden">
                          <div className="w-full h-full bg-sage-100" />
                        </div>
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{product.sku}</td>
                    <td className="py-4 px-6">
                      <span className="capitalize">{product.category}</span>
                    </td>
                    <td className="py-4 px-6 font-medium">{formatPrice(product.price)}</td>
                    <td className="py-4 px-6">
                      <span className={product.stock === 0 ? 'text-red-500' : product.stock < 20 ? 'text-orange-500' : ''}>
                        {product.stock}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <Badge
                        variant={
                          product.status === 'active' ? 'success' :
                          product.status === 'out_of_stock' ? 'destructive' : 'secondary'
                        }
                      >
                        {product.status === 'out_of_stock' ? 'Out of Stock' : 
                         product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/admin/products/${product.id}/edit`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing 1-{products.length} of {products.length} products
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>Previous</Button>
          <Button variant="outline" size="sm" disabled>Next</Button>
        </div>
      </div>
    </div>
  );
}
