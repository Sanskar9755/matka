# Design Document — Market Lock Timing Fix

## Overview

This fix corrects the market lockout worker to support two independent, session-specific lock schedules per market:

- **Open session lock**: fires at `open_result_time − 20 minutes` → sets `open_locked = true` on the market
- **Close session lock**: fires at `close_time − 20 minutes` → sets the market `status = 'locked'`

Both locks reset at midnight via the existing `dailyReset.ts` worker (no changes needed there).

The current `MarketStatus` enum (`open | locked | closed`) is insufficient — it cannot represent "open session locked but close session still open." A new boolean column `open_session_locked` is added to the `Market` table to track open-session lock state independently from the main `status` field.

---

## Architecture

### Affected Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `open_session_locked Boolean @default(false)` to `Market` model |
| `prisma/migrations/` | New migration for the schema change |
| `src/workers/marketLockout.ts` | Full rewrite of scheduling and processing logic |
| `src/api/bets/bets.service.ts` | Fix open-session lock check (currently uses wrong field) |

### No Changes Needed

- `dailyReset.ts` — already resets `status` to `open` for all active markets. We add `open_session_locked: false` to its reset payload.
- `bullmq.ts` — queue infrastructure unchanged
- Frontend — market status display unchanged (locked/closed states already handled)

---

## Database Schema Change

Add one boolean column to the `Market` model:

```prisma
model Market {
  // ... existing fields ...
  open_session_locked Boolean      @default(false) // true after open_result_time − 20 min
}
```

Migration SQL:
```sql
ALTER TABLE "markets" ADD COLUMN "open_session_locked" BOOLEAN NOT NULL DEFAULT false;
```

The `dailyReset` worker's `performDailyReset()` must also reset this field:
```ts
await prisma.market.updateMany({
  where: { is_active: true },
  data: { status: 'open', open_session_locked: false },
});
```

---

## Worker Design — `marketLockout.ts`

### Updated Types

```ts
export interface MarketLockoutJobData {
  marketId: string;
  action?: 'open-lock' | 'close-lock' | 'close';
}

export interface MarketScheduleInput {
  id: string;
  open_result_time: string; // HH:MM — open session locks 20 min before this
  close_time: string;       // HH:MM — close session locks 20 min before this
  result_time: string;      // HH:MM — market closes 1 min after this
  is_active: boolean;
}
```

### Scheduling Logic

`scheduleMarketLockout(market)` now schedules **two** delayed jobs per market:

```
Job 1: action='open-lock'
  delay = msUntil(getTodayAt(open_result_time) − 20 min)
  jobId = `market-open-lock:${market.id}:${date}`

Job 2: action='close-lock'
  delay = msUntil(getTodayAt(close_time) − 20 min)
  jobId = `market-close-lock:${market.id}:${date}`
```

Each job is skipped independently if its lockout time has already passed today.

### Processing Logic

**`action = 'open-lock'`**
1. Fetch market from DB
2. Guard: if `now < open_result_time − 20 min`, skip (fired early)
3. Set `market.open_session_locked = true`
4. Publish `market:open-locked` event on `market:<id>` Redis channel

**`action = 'close-lock'`** (replaces current default lock path)
1. Fetch market from DB
2. Guard: if `now < close_time − 20 min`, skip (fired early)
3. Set `market.status = 'locked'`
4. Publish `market:locked` event on `market:<id>` Redis channel
5. Schedule `action='close'` job at `result_time + 1 min`

**`action = 'close'`** (unchanged)
1. Set `market.status = 'closed'`
2. Publish `market:closed` event

### `scheduleAllMarketLockouts` Update

Fetch all active markets including `open_result_time` and `result_time`:

```ts
const markets = await prisma.market.findMany({
  where: { is_active: true },
  select: { id: true, open_result_time: true, close_time: true, result_time: true, is_active: true },
});
```

---

## Bet Service Fix — `bets.service.ts`

The current open-session lock check is wrong:

```ts
// CURRENT (WRONG) — locks 20 min AFTER open_time
const openLockMins = parseTimeToMinutes(market.open_time) + 20;
if (currentMins >= openLockMins) throw new AppError('MARKET_LOCKED');
```

Replace with a DB-state check using the new `open_session_locked` field:

```ts
// FIXED — check DB flag set by the open-lock job
if (session === 'open' && market.open_session_locked) {
  throw new AppError('MARKET_LOCKED');
}
```

This makes the bet service consistent with the worker: the worker sets the flag at the right time, and the service reads it. No time arithmetic in the service.

---

## Event Payloads

### `market:open-locked`
```json
{
  "event": "market:open-locked",
  "marketId": "<id>",
  "lockedAt": "<ISO timestamp>"
}
```

### `market:locked` (close session locked — existing, unchanged)
```json
{
  "event": "market:locked",
  "marketId": "<id>",
  "lockedAt": "<ISO timestamp>"
}
```

---

## Daily Reset Integration

`dailyReset.ts` → `performDailyReset()` must reset both lock states:

```ts
await prisma.market.updateMany({
  where: { is_active: true },
  data: {
    status: 'open',
    open_session_locked: false,  // ← add this
  },
});
```

This ensures both sessions unlock at midnight for the next day.

---

## Lock Timeline Example (Kalyan)

```
open_time        = 10:00
open_result_time = 11:00  → open-lock fires at 10:40
close_time       = 13:00  → close-lock fires at 12:40
result_time      = 13:00  → market closes at 13:01

10:00  Market opens (status=open, open_session_locked=false)
10:40  open-lock job fires → open_session_locked=true
       Open bets rejected. Close bets still accepted.
12:40  close-lock job fires → status=locked
       All bets rejected.
13:01  close job fires → status=closed
00:00  dailyReset → status=open, open_session_locked=false
```

---

## Migration Plan

1. Add `open_session_locked` column (default `false`) — non-breaking, backward compatible
2. Deploy updated worker — new jobs use `open-lock`/`close-lock` action names; old `lockout` jobs still in queue will hit the `else` branch (close-lock path) safely
3. No data migration needed — default `false` is correct for all existing markets

---

## Testing

### Unit Tests (`marketLockout.test.ts`)

- `scheduleMarketLockout` schedules exactly 2 jobs when `open_result_time` is set and both times are in the future
- `scheduleMarketLockout` skips open-lock job if `open_result_time − 20 min` has passed
- `scheduleMarketLockout` skips close-lock job if `close_time − 20 min` has passed
- `processOpenLock` sets `open_session_locked = true` and publishes `market:open-locked`
- `processCloseLock` sets `status = 'locked'` and publishes `market:locked`
- `processCloseLock` uses `close_time` (not `result_time`) for the guard check

### Integration Tests (`bets.service.test.ts`)

- Open-session bet rejected when `open_session_locked = true`
- Close-session bet accepted when `open_session_locked = true` but `status = 'open'`
- All bets rejected when `status = 'locked'`
