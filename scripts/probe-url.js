const baseUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';

const endpoints = [
  '',
  '/api/health',
  '/_/'
];

console.log(`Probing Base URL: ${baseUrl}`);

async function probe() {
  for (const ep of endpoints) {
    const fullUrl = `${baseUrl}${ep}`;
    try {
      const res = await fetch(fullUrl, { method: 'HEAD' });
      console.log(`[${res.status}] ${fullUrl}`);
    } catch (e) {
      console.log(`[ERR] ${fullUrl} - ${e.message}`);
    }
  }
}

probe();
