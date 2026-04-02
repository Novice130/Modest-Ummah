import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_SZvMx9f6AucU@ep-soft-truth-a840okl3-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL);

const products = [
  // ─── Women's Abayas ──────────────────────────────────
  {
    name: 'Black Abaya with Gold Stone Work',
    slug: 'black-abaya-gold-stone-work',
    description: 'Elegant black abaya featuring exquisite gold stone work detailing along the front and sleeves. The front zipper closure adds a modern touch to this classic design, making it easy to wear while maintaining a polished look. Crafted from premium breathable fabric that drapes beautifully for all-day comfort. Perfect for special occasions, gatherings, and everyday modest wear.',
    short_description: 'Premium black abaya with gold stone work and front zipper closure',
    price: '89.99',
    compare_at_price: '129.99',
    category: 'women',
    subcategory: 'abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([
      { name: 'Black', value: '#000000' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    tags: JSON.stringify(['abaya', 'black', 'gold', 'stone work', 'zipper', 'formal']),
    featured: true,
    in_stock: true,
    stock_quantity: 25,
    sku: 'MU-ABY-BLK-GLD-001',
  },
  {
    name: 'Royal Black Abaya with Golden Embellishments',
    slug: 'royal-black-abaya-golden-embellishments',
    description: 'A luxurious black abaya adorned with intricate golden embellishments and stone work. Features a sleek zipper front design that combines traditional elegance with contemporary styling. The flowing silhouette provides modest coverage while the golden accents add a touch of royalty. Made from high-quality nida fabric for a smooth, wrinkle-resistant finish.',
    short_description: 'Luxurious black abaya with golden embellishments and zipper front',
    price: '99.99',
    compare_at_price: '149.99',
    category: 'women',
    subcategory: 'abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([
      { name: 'Black', value: '#000000' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    tags: JSON.stringify(['abaya', 'black', 'gold', 'embellished', 'royal', 'formal']),
    featured: true,
    in_stock: true,
    stock_quantity: 20,
    sku: 'MU-ABY-BLK-GLD-002',
  },
  {
    name: 'Grey Abaya with Silver Embroidery',
    slug: 'grey-abaya-silver-embroidery',
    description: 'Sophisticated grey abaya featuring delicate silver embroidery work throughout. Designed by Arab Abaya, this piece showcases masterful craftsmanship with intricate thread work that catches the light beautifully. The soft grey fabric provides a modern alternative to traditional black, while maintaining full modest coverage. Ideal for both formal events and elevated everyday wear.',
    short_description: 'Arab Abaya brand grey abaya with elegant silver embroidery',
    price: '109.99',
    compare_at_price: '159.99',
    category: 'women',
    subcategory: 'abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([
      { name: 'Grey', value: '#808080' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    tags: JSON.stringify(['abaya', 'grey', 'silver', 'embroidery', 'arab abaya', 'formal']),
    featured: true,
    in_stock: true,
    stock_quantity: 18,
    sku: 'MU-ABY-GRY-SLV-001',
  },
  {
    name: 'Silver Threaded Grey Abaya',
    slug: 'silver-threaded-grey-abaya',
    description: 'An exquisite grey abaya with silver thread embroidery detailing by Arab Abaya. The delicate silver patterns create a stunning visual effect against the muted grey fabric. Features a comfortable loose fit with wide sleeves, providing ease of movement while looking refined. Perfect for those who appreciate subtle luxury in their modest wardrobe.',
    short_description: 'Premium grey abaya with silver thread embroidery by Arab Abaya',
    price: '119.99',
    compare_at_price: '169.99',
    category: 'women',
    subcategory: 'abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([
      { name: 'Grey', value: '#808080' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    tags: JSON.stringify(['abaya', 'grey', 'silver', 'thread work', 'arab abaya', 'premium']),
    featured: false,
    in_stock: true,
    stock_quantity: 15,
    sku: 'MU-ABY-GRY-SLV-002',
  },
  {
    name: 'Dark Abaya with Gold Peacock Feather Motif',
    slug: 'dark-abaya-gold-peacock-feather',
    description: 'A stunning dark grey abaya featuring an elaborate gold peacock feather motif that cascades gracefully down the front. This unique design blends traditional Islamic fashion with artistic expression, creating a statement piece for your wardrobe. The rich gold embroidery on dark fabric creates a dramatic contrast that is both elegant and eye-catching. Crafted from premium crepe fabric for a smooth, luxurious feel.',
    short_description: 'Statement dark abaya with gold peacock feather embroidery motif',
    price: '129.99',
    compare_at_price: '189.99',
    category: 'women',
    subcategory: 'abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([
      { name: 'Dark Grey', value: '#333333' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    tags: JSON.stringify(['abaya', 'dark grey', 'gold', 'peacock', 'statement', 'premium']),
    featured: true,
    in_stock: true,
    stock_quantity: 12,
    sku: 'MU-ABY-DRK-PCK-001',
  },
  {
    name: 'Peacock Gold Embroidered Abaya',
    slug: 'peacock-gold-embroidered-abaya',
    description: 'A magnificent dark abaya showcasing an intricate gold peacock feather embroidery design. Each feather detail is carefully stitched with metallic gold thread, creating a mesmerizing pattern that flows elegantly with your movement. The deep charcoal base fabric provides the perfect canvas for the golden artwork. Features comfortable bell sleeves and a flowing A-line silhouette.',
    short_description: 'Dark abaya with intricate gold peacock feather embroidery',
    price: '139.99',
    compare_at_price: '199.99',
    category: 'women',
    subcategory: 'abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([
      { name: 'Charcoal', value: '#2D2D2D' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    tags: JSON.stringify(['abaya', 'charcoal', 'gold', 'peacock', 'embroidered', 'luxury']),
    featured: false,
    in_stock: true,
    stock_quantity: 10,
    sku: 'MU-ABY-DRK-PCK-002',
  },
  {
    name: 'Brown Abaya with Button Front & Lace Detail',
    slug: 'brown-abaya-button-front-lace',
    description: 'A warm and elegant brown abaya featuring a button-front closure and delicate lace detailing along the cuffs and hem. This unique earth-toned abaya offers a refreshing departure from traditional black while maintaining modest coverage. The button front provides adjustable coverage and a polished look. Lace trim adds a feminine touch to the classic silhouette. Made from soft, breathable fabric perfect for transitional weather.',
    short_description: 'Elegant brown abaya with button front closure and lace trim',
    price: '84.99',
    compare_at_price: '119.99',
    category: 'women',
    subcategory: 'abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([
      { name: 'Brown', value: '#8B4513' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    tags: JSON.stringify(['abaya', 'brown', 'button front', 'lace', 'casual', 'everyday']),
    featured: true,
    in_stock: true,
    stock_quantity: 22,
    sku: 'MU-ABY-BRN-LCE-001',
  },
  {
    name: 'Dark Grey Abaya with Silver Embroidery',
    slug: 'dark-grey-abaya-silver-embroidery',
    description: 'A refined dark grey abaya adorned with elegant silver embroidery work along the neckline, sleeves, and front panel. The subtle silver detailing against the dark grey fabric creates a sophisticated look that transitions seamlessly from day to evening wear. Features a relaxed fit with slightly flared sleeves for comfort and style. An essential addition to any modest wardrobe.',
    short_description: 'Refined dark grey abaya with silver embroidery detailing',
    price: '94.99',
    compare_at_price: '139.99',
    category: 'women',
    subcategory: 'abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([
      { name: 'Dark Grey', value: '#444444' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    tags: JSON.stringify(['abaya', 'dark grey', 'silver', 'embroidery', 'versatile']),
    featured: false,
    in_stock: true,
    stock_quantity: 20,
    sku: 'MU-ABY-DGR-SLV-001',
  },

  // ─── Men's Products ──────────────────────────────────
  {
    name: 'Premium White Thobe',
    slug: 'premium-white-thobe',
    description: 'A classic white thobe crafted from premium quality cotton-polyester blend fabric. Features a clean, minimalist design with subtle embroidery on the cuffs. The breathable fabric ensures comfort throughout the day, whether for Jummah prayers, Eid celebrations, or everyday wear. Easy-care fabric that resists wrinkles and maintains its crisp appearance.',
    short_description: 'Classic white thobe in premium breathable fabric',
    price: '69.99',
    compare_at_price: '99.99',
    category: 'men',
    subcategory: 'thobes',
    images: JSON.stringify(['/images/products/thobe-1.jpg']),
    colors: JSON.stringify([
      { name: 'White', value: '#FFFFFF' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    tags: JSON.stringify(['thobe', 'white', 'men', 'classic', 'premium']),
    featured: true,
    in_stock: true,
    stock_quantity: 30,
    sku: 'MU-THB-WHT-001',
  },
  {
    name: 'Navy Embroidered Kurta',
    slug: 'navy-embroidered-kurta',
    description: 'A stunning navy blue kurta featuring intricate gold embroidery around the neckline and cuffs. This traditional men\'s garment combines cultural heritage with modern craftsmanship. The rich navy fabric paired with elegant gold thread work creates a sophisticated look perfect for special occasions. Made from comfortable cotton blend fabric with side slits for ease of movement.',
    short_description: 'Navy blue kurta with intricate gold embroidery',
    price: '59.99',
    compare_at_price: '89.99',
    category: 'men',
    subcategory: 'kurtas',
    images: JSON.stringify(['/images/products/kurta-1.jpg']),
    colors: JSON.stringify([
      { name: 'Navy', value: '#1B2A4A' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    tags: JSON.stringify(['kurta', 'navy', 'embroidered', 'gold', 'men', 'formal']),
    featured: true,
    in_stock: true,
    stock_quantity: 25,
    sku: 'MU-KRT-NVY-001',
  },

  // ─── Women's Hijabs & Khimars ────────────────────────
  {
    name: 'Sage Green Premium Hijab',
    slug: 'sage-green-premium-hijab',
    description: 'A beautifully soft sage green hijab made from premium chiffon fabric. This versatile piece drapes elegantly and can be styled in multiple ways. The muted sage tone complements a wide range of outfit colors and is perfect for both casual and formal occasions. Lightweight and breathable, ideal for year-round wear.',
    short_description: 'Soft sage green chiffon hijab for versatile styling',
    price: '24.99',
    compare_at_price: '34.99',
    category: 'women',
    subcategory: 'hijabs',
    images: JSON.stringify(['/images/products/hijab-1.jpg']),
    colors: JSON.stringify([
      { name: 'Sage Green', value: '#87AE73' },
    ]),
    sizes: JSON.stringify(['One Size']),
    tags: JSON.stringify(['hijab', 'sage', 'green', 'chiffon', 'women', 'versatile']),
    featured: false,
    in_stock: true,
    stock_quantity: 50,
    sku: 'MU-HJB-SGE-001',
  },
  {
    name: 'Sage Green Khimar',
    slug: 'sage-green-khimar',
    description: 'A flowing sage green khimar that provides elegant and modest coverage. This one-piece design slips on easily and covers the head, shoulders, and upper body beautifully. Made from premium medina silk fabric that is lightweight yet opaque. The soft sage color brings a fresh, modern feel to traditional modest wear.',
    short_description: 'Flowing sage green khimar in premium medina silk',
    price: '39.99',
    compare_at_price: '54.99',
    category: 'women',
    subcategory: 'khimars',
    images: JSON.stringify(['/images/products/khimar-1.jpg']),
    colors: JSON.stringify([
      { name: 'Sage Green', value: '#87AE73' },
    ]),
    sizes: JSON.stringify(['One Size']),
    tags: JSON.stringify(['khimar', 'sage', 'green', 'medina silk', 'women', 'modest']),
    featured: false,
    in_stock: true,
    stock_quantity: 35,
    sku: 'MU-KHM-SGE-001',
  },

  // ─── Accessories ──────────────────────────────────────
  {
    name: 'Gold Embroidered Kufi Cap',
    slug: 'gold-embroidered-kufi-cap',
    description: 'A beautifully crafted white kufi cap featuring intricate gold and silver geometric embroidery. The traditional Islamic geometric patterns are hand-embroidered with metallic threads, creating a stunning visual effect. Perfect for daily prayers, Jummah, or Eid celebrations. Comfortable cotton lining ensures all-day wearability.',
    short_description: 'Hand-embroidered white kufi with gold geometric patterns',
    price: '29.99',
    compare_at_price: '44.99',
    category: 'accessories',
    subcategory: 'kufi',
    images: JSON.stringify(['/images/products/kufi-1.jpg']),
    colors: JSON.stringify([
      { name: 'White/Gold', value: '#DAA520' },
    ]),
    sizes: JSON.stringify(['S', 'M', 'L']),
    tags: JSON.stringify(['kufi', 'cap', 'embroidered', 'gold', 'men', 'prayer']),
    featured: false,
    in_stock: true,
    stock_quantity: 40,
    sku: 'MU-KFI-GLD-001',
  },
  {
    name: 'Arabian Oud Attar - Premium Collection',
    slug: 'arabian-oud-attar-premium',
    description: 'An exquisite Arabian Oud Attar from our Premium Collection. This alcohol-free perfume oil features rich, deep oud notes blended with warm amber and delicate rose. The concentrated formula means a small dab lasts all day. Presented in a beautifully crafted glass bottle with gold detailing. A true luxury fragrance for the discerning individual.',
    short_description: 'Premium alcohol-free Arabian Oud Attar perfume oil',
    price: '49.99',
    compare_at_price: '74.99',
    category: 'accessories',
    subcategory: 'fragrance',
    images: JSON.stringify(['/images/products/attar-1.jpg']),
    colors: JSON.stringify([]),
    sizes: JSON.stringify(['12ml', '25ml']),
    tags: JSON.stringify(['attar', 'oud', 'perfume', 'fragrance', 'alcohol-free', 'premium']),
    featured: true,
    in_stock: true,
    stock_quantity: 45,
    sku: 'MU-ATR-OUD-001',
  },
  {
    name: 'Natural Miswak Sticks (Pack of 5)',
    slug: 'natural-miswak-sticks-pack-5',
    description: 'A pack of 5 natural miswak sticks sourced from the Salvadora Persica tree. Following the Sunnah of Prophet Muhammad (PBUH), miswak has been used for centuries for its natural teeth-cleaning properties. Each stick is hand-selected for quality and freshness. Naturally antibacterial and contains beneficial minerals for oral health. Vacuum-sealed for freshness.',
    short_description: 'Pack of 5 fresh natural miswak sticks for oral hygiene',
    price: '9.99',
    compare_at_price: '14.99',
    category: 'accessories',
    subcategory: 'sunnah',
    images: JSON.stringify(['/images/products/miswak-1.jpg']),
    colors: JSON.stringify([]),
    sizes: JSON.stringify(['Standard']),
    tags: JSON.stringify(['miswak', 'sunnah', 'natural', 'oral care', 'islamic']),
    featured: false,
    in_stock: true,
    stock_quantity: 100,
    sku: 'MU-MSK-NAT-005',
  },
];

async function seedProducts() {
  // Check for existing products
  const existing = await sql`SELECT slug FROM products`;
  const existingSlugs = new Set(existing.map(p => p.slug));

  let created = 0;
  let skipped = 0;

  for (const p of products) {
    if (existingSlugs.has(p.slug)) {
      console.log(`  Skipped (exists): ${p.name}`);
      skipped++;
      continue;
    }

    await sql`
      INSERT INTO products (
        name, slug, description, short_description, price, compare_at_price,
        category, subcategory, images, colors, sizes, tags,
        featured, in_stock, stock_quantity, sku,
        created_at, updated_at
      ) VALUES (
        ${p.name}, ${p.slug}, ${p.description}, ${p.short_description},
        ${p.price}, ${p.compare_at_price}, ${p.category}, ${p.subcategory},
        ${p.images}, ${p.colors}, ${p.sizes}, ${p.tags},
        ${p.featured}, ${p.in_stock}, ${p.stock_quantity}, ${p.sku},
        NOW(), NOW()
      )
    `;
    console.log(`  Created: ${p.name}`);
    created++;
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);

  // Show total count
  const [countResult] = await sql`SELECT COUNT(*) as total FROM products`;
  console.log(`Total products in database: ${countResult.total}`);
}

seedProducts().catch(console.error);
