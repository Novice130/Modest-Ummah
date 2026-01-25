/**
 * Seed Script - Add Sample Products to PocketBase
 * 
 * Run with: node scripts/seed-products.js
 * 
 * Make sure POCKETBASE_URL is set or update the URL below
 */

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://api.modestummah.com';

// Sample product images from Unsplash (free to use)
const sampleProducts = [
  // Men's Collection
  {
    name: 'Premium White Thobe',
    slug: 'premium-white-thobe',
    description: 'Elegant white thobe made from premium breathable cotton. Perfect for daily prayers and special occasions. Features traditional embroidery on the collar and cuffs.',
    shortDescription: 'Classic white thobe with premium cotton fabric',
    price: 89.99,
    compareAtPrice: 120.00,
    category: 'men',
    subcategory: 'Thobes',
    images: ['https://images.unsplash.com/photo-1589363460779-cd717d2ed8fa?w=600'],
    colors: [
      { name: 'White', value: '#FFFFFF' },
      { name: 'Cream', value: '#FFFDD0' }
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    tags: ['thobe', 'men', 'prayer', 'traditional', 'cotton'],
    featured: true,
    inStock: true,
    stockQuantity: 50,
    sku: 'MEN-THB-001',
    weight: 16,
  },
  {
    name: 'Black Embroidered Thobe',
    slug: 'black-embroidered-thobe',
    description: 'Sophisticated black thobe with intricate gold embroidery. Made from high-quality fabric that drapes beautifully. Ideal for Eid, weddings, and formal gatherings.',
    shortDescription: 'Elegant black thobe with gold embroidery',
    price: 129.99,
    compareAtPrice: 159.99,
    category: 'men',
    subcategory: 'Thobes',
    images: ['https://images.unsplash.com/photo-1578932750294-f5f5cd1e7a6e?w=600'],
    colors: [
      { name: 'Black', value: '#000000' },
      { name: 'Navy', value: '#000080' }
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    tags: ['thobe', 'men', 'formal', 'embroidered', 'eid'],
    featured: true,
    inStock: true,
    stockQuantity: 30,
    sku: 'MEN-THB-002',
    weight: 18,
  },
  {
    name: 'Men\'s Prayer Kufi Cap',
    slug: 'mens-prayer-kufi-cap',
    description: 'Traditional kufi cap made from soft, breathable cotton. Comfortable for extended wear during prayers and daily use. Features classic geometric patterns.',
    shortDescription: 'Comfortable cotton kufi cap',
    price: 19.99,
    compareAtPrice: 29.99,
    category: 'men',
    subcategory: 'Accessories',
    images: ['https://images.unsplash.com/photo-1622396481328-9b1b78a51f9c?w=600'],
    colors: [
      { name: 'White', value: '#FFFFFF' },
      { name: 'Black', value: '#000000' },
      { name: 'Brown', value: '#8B4513' }
    ],
    sizes: ['One Size'],
    tags: ['kufi', 'cap', 'prayer', 'men', 'accessories'],
    featured: false,
    inStock: true,
    stockQuantity: 100,
    sku: 'MEN-ACC-001',
    weight: 4,
  },

  // Women's Collection
  {
    name: 'Elegant Black Abaya',
    slug: 'elegant-black-abaya',
    description: 'Timeless black abaya crafted from flowing premium fabric. Features subtle floral embroidery along the sleeves and hem. Perfect for daily wear and special occasions.',
    shortDescription: 'Classic black abaya with floral embroidery',
    price: 149.99,
    compareAtPrice: 199.99,
    category: 'women',
    subcategory: 'Abayas',
    images: ['https://images.unsplash.com/photo-1590073242678-70ee3fc28e8e?w=600'],
    colors: [
      { name: 'Black', value: '#000000' },
      { name: 'Navy', value: '#000080' }
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    tags: ['abaya', 'women', 'modest', 'embroidered', 'elegant'],
    featured: true,
    inStock: true,
    stockQuantity: 40,
    sku: 'WMN-ABY-001',
    weight: 20,
  },
  {
    name: 'Dusty Rose Hijab Set',
    slug: 'dusty-rose-hijab-set',
    description: 'Beautiful dusty rose hijab set includes a premium chiffon hijab and matching undercap. Soft, lightweight fabric that drapes beautifully and stays in place all day.',
    shortDescription: 'Premium chiffon hijab with matching undercap',
    price: 34.99,
    compareAtPrice: 49.99,
    category: 'women',
    subcategory: 'Hijabs',
    images: ['https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=600'],
    colors: [
      { name: 'Dusty Rose', value: '#D4A5A5' },
      { name: 'Mauve', value: '#E0B0FF' },
      { name: 'Sage', value: '#9DC183' }
    ],
    sizes: ['One Size'],
    tags: ['hijab', 'women', 'chiffon', 'set', 'modest'],
    featured: true,
    inStock: true,
    stockQuantity: 80,
    sku: 'WMN-HIJ-001',
    weight: 6,
  },
  {
    name: 'Modest Maxi Dress - Emerald',
    slug: 'modest-maxi-dress-emerald',
    description: 'Stunning emerald green maxi dress with long sleeves and flowing skirt. Made from soft, breathable fabric. Perfect for gatherings, events, and everyday elegance.',
    shortDescription: 'Elegant emerald maxi dress with long sleeves',
    price: 89.99,
    compareAtPrice: 119.99,
    category: 'women',
    subcategory: 'Dresses',
    images: ['https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600'],
    colors: [
      { name: 'Emerald', value: '#50C878' },
      { name: 'Burgundy', value: '#800020' },
      { name: 'Navy', value: '#000080' }
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    tags: ['dress', 'maxi', 'women', 'modest', 'elegant'],
    featured: false,
    inStock: true,
    stockQuantity: 35,
    sku: 'WMN-DRS-001',
    weight: 14,
  },
  {
    name: 'Jersey Hijab - Essential Collection',
    slug: 'jersey-hijab-essential',
    description: 'Versatile jersey hijab from our Essential Collection. Soft, stretchy, and easy to style. Perfect for everyday wear. Available in multiple colors.',
    shortDescription: 'Soft jersey hijab for everyday wear',
    price: 24.99,
    compareAtPrice: 34.99,
    category: 'women',
    subcategory: 'Hijabs',
    images: ['https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=600'],
    colors: [
      { name: 'Black', value: '#000000' },
      { name: 'White', value: '#FFFFFF' },
      { name: 'Nude', value: '#E3BC9A' },
      { name: 'Grey', value: '#808080' }
    ],
    sizes: ['One Size'],
    tags: ['hijab', 'jersey', 'women', 'everyday', 'essential'],
    featured: false,
    inStock: true,
    stockQuantity: 120,
    sku: 'WMN-HIJ-002',
    weight: 4,
  },

  // Accessories
  {
    name: 'Prayer Rug - Geometric Pattern',
    slug: 'prayer-rug-geometric',
    description: 'Beautiful prayer rug featuring traditional geometric patterns. Made from soft, plush material that\'s comfortable for extended prayers. Includes a travel pouch.',
    shortDescription: 'Soft prayer rug with geometric design',
    price: 39.99,
    compareAtPrice: 54.99,
    category: 'accessories',
    subcategory: 'Prayer Rugs',
    images: ['https://images.unsplash.com/photo-1585036156171-384164a8c675?w=600'],
    colors: [
      { name: 'Green', value: '#228B22' },
      { name: 'Blue', value: '#4169E1' },
      { name: 'Red', value: '#DC143C' }
    ],
    sizes: ['Standard', 'Large'],
    tags: ['prayer rug', 'sajjada', 'prayer', 'accessories', 'mosque'],
    featured: true,
    inStock: true,
    stockQuantity: 60,
    sku: 'ACC-RUG-001',
    weight: 24,
  },
  {
    name: 'Tasbeeh Prayer Beads - Olive Wood',
    slug: 'tasbeeh-olive-wood',
    description: 'Handcrafted tasbeeh made from genuine olive wood sourced from the Holy Land. 99 beads with elegant tassel. Perfect for dhikr and daily remembrance.',
    shortDescription: 'Authentic olive wood prayer beads',
    price: 29.99,
    compareAtPrice: 39.99,
    category: 'accessories',
    subcategory: 'Tasbeeh',
    images: ['https://images.unsplash.com/photo-1609599003845-e5c1d9b8c6ef?w=600'],
    colors: [
      { name: 'Natural Wood', value: '#DEB887' }
    ],
    sizes: ['99 Beads', '33 Beads'],
    tags: ['tasbeeh', 'prayer beads', 'dhikr', 'olive wood', 'islamic'],
    featured: false,
    inStock: true,
    stockQuantity: 75,
    sku: 'ACC-TSB-001',
    weight: 3,
  },
  {
    name: 'Quran Stand - Wooden Rehal',
    slug: 'quran-stand-wooden-rehal',
    description: 'Beautifully carved wooden Quran stand (Rehal) with intricate Islamic patterns. Folds flat for easy storage. Perfect gift for loved ones.',
    shortDescription: 'Carved wooden Quran stand',
    price: 44.99,
    compareAtPrice: 59.99,
    category: 'accessories',
    subcategory: 'Quran Stands',
    images: ['https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=600'],
    colors: [
      { name: 'Walnut', value: '#5D432C' },
      { name: 'Oak', value: '#C19A6B' }
    ],
    sizes: ['Small', 'Medium', 'Large'],
    tags: ['rehal', 'quran stand', 'wooden', 'islamic', 'gift'],
    featured: false,
    inStock: true,
    stockQuantity: 40,
    sku: 'ACC-RHL-001',
    weight: 32,
  },
];

async function seedProducts() {
  console.log('🌱 Starting product seeding...');
  console.log(`📡 PocketBase URL: ${POCKETBASE_URL}`);

  let successCount = 0;
  let errorCount = 0;

  for (const product of sampleProducts) {
    try {
      // Remove images field since PocketBase expects file uploads
      const productData = {
        name: product.name,
        slug: product.slug,
        description: product.description,
        shortDescription: product.shortDescription,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        category: product.category,
        subcategory: product.subcategory,
        colors: JSON.stringify(product.colors),
        sizes: JSON.stringify(product.sizes),
        tags: JSON.stringify(product.tags),
        featured: product.featured,
        inStock: product.inStock,
        stockQuantity: product.stockQuantity,
        sku: product.sku,
        weight: product.weight,
        similarProducts: JSON.stringify([]),
      };

      const response = await fetch(`${POCKETBASE_URL}/api/collections/products/records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(productData),
      });

      const responseText = await response.text();
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = responseText;
        }
        console.error(`❌ Failed to create "${product.name}":`, errorData);
        errorCount++;
      } else {
        let created;
        try {
          created = JSON.parse(responseText);
        } catch {
          created = { id: 'unknown' };
        }
        console.log(`✅ Created: ${product.name} (ID: ${created.id})`);
        successCount++;
      }
    } catch (error) {
      console.error(`❌ Error creating "${product.name}":`, error.message);
      errorCount++;
    }
  }

  console.log('\n📊 Seeding complete!');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log('\n📷 Note: Images need to be uploaded manually via PocketBase admin panel.');
}

// Run the seeder
seedProducts();
