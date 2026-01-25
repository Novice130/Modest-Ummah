/**
 * Upload Images to Products in PocketBase
 * 
 * Run with: node scripts/upload-product-images.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb.modestummah.com';

// Product images - using placeholder images that are free to use
const productImages = {
  'premium-white-thobe': 'https://images.pexels.com/photos/6764040/pexels-photo-6764040.jpeg?w=600',
  'black-embroidered-thobe': 'https://images.pexels.com/photos/6764007/pexels-photo-6764007.jpeg?w=600',
  'mens-prayer-kufi-cap': 'https://images.pexels.com/photos/6765368/pexels-photo-6765368.jpeg?w=600',
  'elegant-black-abaya': 'https://images.pexels.com/photos/6764929/pexels-photo-6764929.jpeg?w=600',
  'dusty-rose-hijab-set': 'https://images.pexels.com/photos/6765009/pexels-photo-6765009.jpeg?w=600',
  'modest-maxi-dress-emerald': 'https://images.pexels.com/photos/6764892/pexels-photo-6764892.jpeg?w=600',
  'jersey-hijab-essential': 'https://images.pexels.com/photos/6765055/pexels-photo-6765055.jpeg?w=600',
  'prayer-rug-geometric': 'https://images.pexels.com/photos/6647021/pexels-photo-6647021.jpeg?w=600',
  'tasbeeh-olive-wood': 'https://images.pexels.com/photos/6646918/pexels-photo-6646918.jpeg?w=600',
  'quran-stand-wooden-rehal': 'https://images.pexels.com/photos/6646964/pexels-photo-6646964.jpeg?w=600',
};

// Download image from URL
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
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
    }).on('error', reject);
  });
}

// Get product by slug
async function getProductBySlug(slug) {
  const response = await fetch(
    `${POCKETBASE_URL}/api/collections/products/records?filter=(slug='${slug}')`
  );
  const data = await response.json();
  return data.items?.[0] || null;
}

// Upload image to product
async function uploadImageToProduct(productId, imageBuffer, filename) {
  const FormData = (await import('node-fetch')).FormData;
  const Blob = (await import('node-fetch')).Blob;
  
  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  formData.append('images', blob, filename);
  
  const response = await fetch(
    `${POCKETBASE_URL}/api/collections/products/records/${productId}`,
    {
      method: 'PATCH',
      body: formData,
    }
  );
  
  return response.ok;
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
      console.log(`   Downloaded: ${imageBuffer.length} bytes`);
      
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
