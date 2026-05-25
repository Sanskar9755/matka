/**
 * update-market-times.js
 *
 * Updates all market timings to DPBoss exact schedule via API.
 * Includes open_result_time (when open session result declares).
 * Lockout = result_time - 20 min (close), open_result_time - 20 min (open).
 *
 * Run: node update-market-times.js
 */

const BASE_URL = 'http://localhost:3000';

// DPBoss exact market timings
// open_result_time = when open ank/panna result comes (open bets lock 20 min before)
// result_time      = when close result comes (full market locks 20 min before)
const MARKETS = [
  // ── MORNING (single session — open_result_time = result_time) ────────────
  { name: 'Sridevi Morning',    open_time: '09:15', close_time: '10:15', result_time: '10:30', open_result_time: '10:30' },
  { name: 'Time Bazar Morning', open_time: '09:45', close_time: '10:45', result_time: '11:00', open_result_time: '11:00' },
  { name: 'Milan Morning',      open_time: '09:00', close_time: '10:00', result_time: '11:00', open_result_time: '11:00' },
  { name: 'Madhur Morning',     open_time: '10:30', close_time: '11:30', result_time: '12:00', open_result_time: '12:00' },
  { name: 'Kalyan Morning',     open_time: '10:45', close_time: '11:45', result_time: '12:00', open_result_time: '12:00' },

  // ── DAY (two session — open result comes first, close result later) ──────
  { name: 'Sridevi',            open_time: '11:35', close_time: '12:35', result_time: '12:35', open_result_time: '12:35' },
  { name: 'Time Bazar',         open_time: '13:00', close_time: '14:00', result_time: '14:00', open_result_time: '13:30' },
  { name: 'Madhur Day',         open_time: '13:30', close_time: '14:30', result_time: '14:30', open_result_time: '14:00' },
  { name: 'Milan Day',          open_time: '15:10', close_time: '17:10', result_time: '17:10', open_result_time: '15:10' },
  { name: 'Rajdhani Day',       open_time: '15:30', close_time: '17:30', result_time: '17:30', open_result_time: '15:30' },
  { name: 'Supreme Day',        open_time: '14:00', close_time: '16:00', result_time: '16:00', open_result_time: '14:30' },
  { name: 'Kalyan',             open_time: '16:00', close_time: '18:00', result_time: '18:00', open_result_time: '16:00' },

  // ── NIGHT ────────────────────────────────────────────────────────────────
  { name: 'Sridevi Night',      open_time: '18:30', close_time: '20:00', result_time: '20:00', open_result_time: '18:30' },
  { name: 'Madhur Night',       open_time: '20:30', close_time: '22:00', result_time: '22:00', open_result_time: '20:30' },
  { name: 'Supreme Night',      open_time: '20:00', close_time: '22:00', result_time: '22:00', open_result_time: '20:00' },
  { name: 'Milan Night',        open_time: '21:00', close_time: '23:00', result_time: '23:00', open_result_time: '21:00' },
  { name: 'Rajdhani Night',     open_time: '21:30', close_time: '23:30', result_time: '23:30', open_result_time: '21:30' },
  { name: 'Kalyan Night',       open_time: '21:30', close_time: '23:30', result_time: '23:30', open_result_time: '21:30' },
  { name: 'Main Bazar',         open_time: '21:00', close_time: '23:30', result_time: '23:40', open_result_time: '21:00' },
];

async function main() {
  console.log('🔐 Logging in...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'SuperAdmin@123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.accessToken;
  if (!token) { console.error('❌ Login failed:', JSON.stringify(loginData)); process.exit(1); }
  console.log('✅ Logged in\n');

  const marketsRes = await fetch(`${BASE_URL}/api/markets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const marketsData = await marketsRes.json();
  const raw = marketsData.data;
  const existing = Array.isArray(raw) ? raw : (raw?.markets ?? []);
  const existingMap = new Map(existing.map(m => [m.name, m]));

  let created = 0, updated = 0, failed = 0;

  for (const market of MARKETS) {
    const existingMarket = existingMap.get(market.name);

    if (existingMarket) {
      const res = await fetch(`${BASE_URL}/api/markets/${existingMarket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          open_time: market.open_time,
          close_time: market.close_time,
          result_time: market.result_time,
          open_result_time: market.open_result_time,
        }),
      });
      if (res.ok) {
        console.log(`🔄 Updated: ${market.name.padEnd(22)} Open: ${market.open_time} | OpenResult: ${market.open_result_time} | CloseResult: ${market.result_time}`);
        updated++;
      } else {
        const err = await res.json();
        console.log(`❌ Failed: ${market.name} — ${JSON.stringify(err)}`);
        failed++;
      }
    } else {
      const res = await fetch(`${BASE_URL}/api/markets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(market),
      });
      if (res.ok) {
        console.log(`✅ Created: ${market.name}`);
        created++;
      } else {
        const err = await res.json();
        console.log(`❌ Failed create: ${market.name} — ${JSON.stringify(err)}`);
        failed++;
      }
    }
  }

  console.log(`\n📊 Done: ${created} created, ${updated} updated, ${failed} failed`);
}

main().catch(console.error);
