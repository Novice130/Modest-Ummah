import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_SZvMx9f6AucU@ep-soft-truth-a840okl3-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL);

const products = [
  {
    name: 'Black Abaya with Gold Stone Work',
    slug: 'black-abaya-gold-stone-work',
    description: 'A stunning black open-front abaya featuring intricate gold and black stone work along the entire front panel and matching sleeve cuffs. The floral stone motifs are carefully hand-applied, creating a rich, textured pattern that catches the light beautifully. A center zipper adds modern convenience while maintaining an elegant look. Crafted from premium crepe fabric with a subtle crinkle texture for a luxurious drape. Perfect for Eid celebrations, formal gatherings, and special occasions where you want to make an impression.',
    short_description: 'Elegant black open-front abaya with gold & black stone work panels and zipper closure',
    price: '89.99',
    compare_at_price: '129.99',
    category: 'women',
    subcategory: 'Abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([{ name: 'Black', value: '#000000' }]),
    sizes: JSON.stringify(['52', '54', '56', '58', '60']),
    tags: JSON.stringify(['abaya', 'black', 'gold', 'stone work', 'zipper', 'formal', 'open front']),
    featured: true,
    in_stock: true,
    stock_quantity: 25,
    sku: 'MU-ABY-BLK-GLD-001',
  },
  {
    name: 'Dark Green Abaya with Gold Stone Work',
    slug: 'dark-green-abaya-gold-stone-work',
    description: 'A sophisticated dark green open-front abaya showcasing the same exquisite gold and black stone work design in a rich forest green colourway. The intricate floral stone patterns run the full length of the front panel with matching cuff details, creating a striking contrast against the deep green crepe fabric. Features a convenient front zipper closure. The flowing A-line silhouette provides graceful movement and modest coverage. An ideal choice for those who love classic abaya design with a fresh colour twist.',
    short_description: 'Rich dark green open-front abaya with gold stone work panels and zipper closure',
    price: '89.99',
    compare_at_price: '129.99',
    category: 'women',
    subcategory: 'Abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([{ name: 'Dark Green', value: '#2F4F4F' }]),
    sizes: JSON.stringify(['52', '54', '56', '58', '60']),
    tags: JSON.stringify(['abaya', 'green', 'gold', 'stone work', 'zipper', 'formal', 'open front']),
    featured: true,
    in_stock: true,
    stock_quantity: 20,
    sku: 'MU-ABY-GRN-GLD-001',
  },
  {
    name: 'Grey Abaya with Silver Leaf Embroidery',
    slug: 'grey-abaya-silver-leaf-embroidery',
    description: 'A beautifully refined grey open-front abaya by Arab Abaya, featuring delicate silver crystal leaf and vine embroidery cascading down both front panels and onto the sleeves. The silver stone work is complemented by elegant silver piping that outlines the front opening and cuffs for a polished finish. Made from smooth, premium satin-finish fabric in a sophisticated charcoal grey that pairs effortlessly with any outfit underneath. The open-front design allows for versatile layering. A timeless piece for everyday elegance or special events.',
    short_description: 'Arab Abaya charcoal grey open-front abaya with silver crystal leaf embroidery and piping',
    price: '109.99',
    compare_at_price: '159.99',
    category: 'women',
    subcategory: 'Abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([{ name: 'Charcoal Grey', value: '#555555' }]),
    sizes: JSON.stringify(['52', '54', '56', '58', '60']),
    tags: JSON.stringify(['abaya', 'grey', 'silver', 'embroidery', 'arab abaya', 'open front', 'crystal']),
    featured: true,
    in_stock: true,
    stock_quantity: 18,
    sku: 'MU-ABY-GRY-SLV-001',
  },
  {
    name: 'Dark Abaya with Gold Peacock Feather Motif',
    slug: 'dark-abaya-gold-peacock-feather',
    description: 'A stunning dark charcoal closed abaya featuring an elaborate gold peacock feather stone motif that adorns the bottom half in a sweeping, artistic arrangement. Each feather is crafted with gold and bronze-toned crystal stones, creating a mesmerising effect as light catches the intricate detailing. The round neckline features a subtle keyhole closure for easy wearing. The A-line silhouette flows beautifully from shoulder to hem, providing both comfort and elegance. Made from smooth premium fabric with a slight sheen. A true statement piece for those who appreciate unique, artisan-level craftsmanship.',
    short_description: 'Dark charcoal closed abaya with gold peacock feather stone motif on lower half',
    price: '129.99',
    compare_at_price: '189.99',
    category: 'women',
    subcategory: 'Abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([{ name: 'Dark Charcoal', value: '#333333' }]),
    sizes: JSON.stringify(['52', '54', '56', '58', '60']),
    tags: JSON.stringify(['abaya', 'charcoal', 'gold', 'peacock', 'stone work', 'closed', 'statement']),
    featured: true,
    in_stock: true,
    stock_quantity: 12,
    sku: 'MU-ABY-DRK-PCK-001',
  },
  {
    name: 'Brown Button-Front Abaya with Lace Detail',
    slug: 'brown-button-front-abaya-lace',
    description: 'A warm and elegant closed-front abaya in a rich coffee brown, featuring gold-toned buttons down the centre front and delicate lace trim that runs alongside the button placket. The turned-back cuffs add a tailored touch to this refined design. Subtle stone detailing along the front and shoulders gives just the right amount of sparkle without being overdone. Made from lustrous satin-finish fabric in a beautiful warm brown that flatters all skin tones. Perfect for everyday modest wear, work, or casual gatherings where understated elegance is desired.',
    short_description: 'Coffee brown button-front abaya with lace trim and turned-back cuffs',
    price: '79.99',
    compare_at_price: '119.99',
    category: 'women',
    subcategory: 'Abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([{ name: 'Coffee Brown', value: '#6B4226' }]),
    sizes: JSON.stringify(['52', '54', '56', '58', '60']),
    tags: JSON.stringify(['abaya', 'brown', 'button front', 'lace', 'casual', 'everyday', 'closed']),
    featured: true,
    in_stock: true,
    stock_quantity: 22,
    sku: 'MU-ABY-BRN-LCE-001',
  },
  {
    name: 'Dark Grey Abaya with Silver Floral Embroidery',
    slug: 'dark-grey-abaya-silver-floral-embroidery',
    description: 'A sophisticated dark grey open-front abaya by Arab Abaya, adorned with wide panels of silver floral embroidery that spread elegantly across both front panels, creating a bold yet refined look. The embroidery features sweeping vine and leaf patterns in silver crystal stones, complemented by silver piping along the front edges and cuffs. The generous width of the embroidery panels makes this design particularly eye-catching. Crafted from premium smooth fabric with a subtle sheen. An exceptional choice for formal events, weddings, and celebrations where you want to look your absolute best.',
    short_description: 'Arab Abaya dark grey open-front abaya with wide silver floral crystal embroidery panels',
    price: '119.99',
    compare_at_price: '169.99',
    category: 'women',
    subcategory: 'Abayas',
    images: JSON.stringify(['/images/products/abaya-1.jpg']),
    colors: JSON.stringify([{ name: 'Dark Grey', value: '#444444' }]),
    sizes: JSON.stringify(['52', '54', '56', '58', '60']),
    tags: JSON.stringify(['abaya', 'dark grey', 'silver', 'floral', 'embroidery', 'arab abaya', 'formal', 'open front']),
    featured: true,
    in_stock: true,
    stock_quantity: 15,
    sku: 'MU-ABY-DGR-SFL-001',
  },
];

async function seedProducts() {
  // Delete ALL existing products first
  console.log('Deleting all existing products...');
  await sql`DELETE FROM products`;
  console.log('All products deleted.\n');

  let created = 0;
  for (const p of products) {
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

  console.log(`\nDone! Created ${created} products.`);
  const [countResult] = await sql`SELECT COUNT(*) as total FROM products`;
  console.log(`Total products in database: ${countResult.total}`);
}

seedProducts().catch(console.error);
