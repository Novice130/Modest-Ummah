const DATABASE_URL = process.env.DATABASE_URL;

const parsed = new URL(DATABASE_URL.replace('postgresql://', 'http://'));
const host = parsed.hostname.replace('-pooler.', '.');

async function query(sql) {
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': DATABASE_URL.split('&channel_binding')[0],
    },
    body: JSON.stringify({ query: sql, params: [] }),
  });
  if (!res.ok) {
    throw new Error(`DB Error: ${await res.text()}`);
  }
  return res.json();
}

async function verify() {
  console.log("🔍 Verifying Neon Database Configuration...");
  
  const tables = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
  console.log(`\n📦 Tables found: \n${tables.rows.map(r => ' - ' + r[0]).join('\n')}`);
  
  const admins = await query("SELECT email, name FROM admins LIMIT 1;");
  console.log(`\n👤 Admin Seeded: \n${admins.rows.length > 0 ? ` - ${admins.rows[0][0]} (${admins.rows[0][1]})` : 'No admin found.'}`);
  
  console.log("\n✅ Database configured successfully!");
}

verify().catch(console.error);
