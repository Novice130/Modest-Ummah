/**
 * Upload Images to Products in PocketBase
 * Uses native Node.js modules only - no external dependencies
 * 
 * Run with: node scripts/upload-images-native.js
 */

const https = require('https');
const http = require('http');

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb.modestummah.com';

// Product slugs to product images (using Pexels free images)
const productImages = {
  'premium-white-thobe': 'https://images.pexels.com/photos/6764040/pexels-photo-6764040.jpeg?auto=compress&cs=tinysrgb&w=600',
  'black-embroidered-thobe': 'https://images.pexels.com/photos/6764007/pexels-photo-6764007.jpeg?auto=compress&cs=tinysrgb&w=600',
  'mens-prayer-kufi-cap': 'https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg?auto=compress&cs=tinysrgb&w=600',
  'elegant-black-abaya': 'https://images.pexels.com/photos/6764929/pexels-photo-6764929.jpeg?auto=compress&cs=tinysrgb&w=600',
  'dusty-rose-hijab-set': 'https://images.pexels.com/photos/7147877/pexels-photo-7147877.jpeg?auto=compress&cs=tinysrgb&w=600',
  'modest-maxi-dress-emerald': 'https://images.pexels.com/photos/6764892/pexels-photo-6764892.jpeg?auto=compress&cs=tinysrgb&w=600',
  'jersey-hijab-essential': 'https://images.pexels.com/photos/7691237/pexels-photo-7691237.jpeg?auto=compress&cs=tinysrgb&w=600',
  'prayer-rug-geometric': 'https://images.pexels.com/photos/6647021/pexels-photo-6647021.jpeg?auto=compress&cs=tinysrgb&w=600',
  'tasbeeh-olive-wood': 'https://images.pexels.com/photos/6646918/pexels-photo-6646918.jpeg?auto=compress&cs=tinysrgb&w=600',
  'quran-stand-wooden-rehal': 'https://images.pexels.com/photos/6646964/pexels-photo-6646964.jpeg?auto=compress&cs=tinysrgb&w=600',
};

// Download image from URL using native https/http
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImage(response.headers.location).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    
    request.on('error', reject);
  });
}

// Get product by slug
async function getProductBySlug(slug) {
  const url = `${POCKETBASE_URL}/api/collections/products/records?filter=(slug='${slug}')`;
  const response = await fetch(url);
  const data = await response.json();
  return data.items?.[0] || null;
}

// Create multipart form data manually
function createMultipartFormData(imageBuffer, filename) {
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  
  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="images"; filename="${filename}"`,
    'Content-Type: image/jpeg',
    '',
    ''
  ].join('\r\n');
  
  const footer = `\r\n--${boundary}--\r\n`;
  
  const headerBuffer = Buffer.from(header, 'utf-8');
  const footerBuffer = Buffer.from(footer, 'utf-8');
  
  const body = Buffer.concat([headerBuffer, imageBuffer, footerBuffer]);
  
  return { body, boundary };
}

// Upload image to product using native https
function uploadImageToProduct(productId, imageBuffer, filename) {
  return new Promise((resolve, reject) => {
    const { body, boundary } = createMultipartFormData(imageBuffer, filename);
    
    const url = new URL(`${POCKETBASE_URL}/api/collections/products/records/${productId}`);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'PATCH',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };
    
    const request = protocol.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        resolve(response.statusCode >= 200 && response.statusCode < 300);
      });
    });
    
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function uploadImages() {
  console.log('🖼️  Starting image upload...');
  console.log(`📡 PocketBase URL: ${POCKETBASE_URL}`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const [slug, imageUrl] of Object.entries(productImages)) {
    try {
      console.log(`\n📦 Processing: ${slug}`);
      
      // Get product
      const product = await getProductBySlug(slug);
      if (!product) {
        console.log(`   ⚠️ Product not found: ${slug}`);
        errorCount++;
        continue;
      }
      
      console.log(`   Found product: ${product.id}`);
      
      // Download image
      console.log(`   📥 Downloading image...`);
      const imageBuffer = await downloadImage(imageUrl);
      console.log(`   Downloaded: ${(imageBuffer.length / 1024).toFixed(1)} KB`);
      
      // Upload to PocketBase
      console.log(`   📤 Uploading to PocketBase...`);
      const success = await uploadImageToProduct(product.id, imageBuffer, `${slug}.jpg`);
      
      if (success) {
        console.log(`   ✅ Image uploaded successfully`);
        successCount++;
      } else {
        console.log(`   ❌ Upload failed`);
        errorCount++;
      }
      
      // Small delay between uploads
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log('\n📊 Upload complete!');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
}

uploadImages();
