// Script to add all missing markets via API
// Run: node add-markets.js

const MARKETS = [
  { name: 'Sridevi Morning',    open_time: '09:30', close_time: '10:30', result_time: '10:35' },
  { name: 'Rudraksh Morning',   open_time: '10:10', close_time: '11:10', result_time: '11:15' },
  { name: 'Karnataka Day',      open_time: '10:05', close_time: '11:05', result_time: '11:10' },
  { name: 'Milan Morning',      open_time: '10:30', close_time: '11:30', result_time: '11:35' },
  { name: 'Kalyan Morning',     open_time: '10:45', close_time: '11:45', result_time: '11:50' },
  { name: 'Time Bazar Morning', open_time: '10:00', close_time: '11:00', result_time: '11:05' },
  { name: 'Sridevi',            open_time: '11:30', close_time: '12:30', result_time: '12:35' },
  { name: 'Madhur Morning',     open_time: '11:00', close_time: '12:00', result_time: '12:05' },
  { name: 'Rudraksh Day',       open_time: '13:00', close_time: '14:30', result_time: '14:35' },
  { name: 'Karnataka Night',    open_time: '18:00', close_time: '19:30', result_time: '19:35' },
  { name: 'Sridevi Night',      open_time: '18:30', close_time: '20:00', result_time: '20:05' },
  { name: 'Rudraksh Night',     open_time: '19:00', close_time: '20:30', result_time: '20:35' },
  { name: 'Kalyan Night',       open_time: '21:30', close_time: '23:30', result_time: '23:35' },
];

async function main() {
  // Login as superadmin
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'SuperAdmin@123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data.accessToken;
  console.log('Logged in as superadmin');

  let added = 0, skipped = 0;
  for (const market of MARKETS) {
    const res = await fetch('http://localhost:3000/api/markets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(market),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`✅ Added: ${market.name}`);
      added++;
    } else {
      console.log(`⚠️  Skipped: ${market.name} — ${data.error?.message ?? 'already exists'}`);
      skipped++;
    }
  }
  console.log(`\nDone: ${added} added, ${skipped} skipped`);
}

main().catch(console.error);
