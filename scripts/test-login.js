const url = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const email = process.env.POCKETBASE_ADMIN_EMAIL;
const password = process.env.POCKETBASE_ADMIN_PASSWORD;

console.log(`Attempting login to: ${url}`);
console.log(`Email: ${email}`);

async function testLogin() {
  try {
    console.log('Checking health...');
    const health = await fetch(`${url}/api/health`);
    console.log('Health Check Status:', health.status, health.statusText);
    
    const res = await fetch(`${url}/api/admins/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password: password }),
    });

    if (!res.ok) {
        const data = await res.json();
        console.error('Login Failed!');
        console.error('Status:', res.status, res.statusText);
        console.error('Response:', JSON.stringify(data, null, 2));
    } else {
        console.log('Login Successful!');
        const data = await res.json();
        console.log('Token received.');
    }
  } catch (err) {
    console.error('Network/Script Error:', err);
  }
}

testLogin();
