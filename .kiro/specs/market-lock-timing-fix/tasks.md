# Implementation Plan

## Overview

Fix the market lock timing bug by adding dual session-specific lock scheduling (open + close), a new `open_session_locked` DB column, and correcting the bet service's session lock check.

## Tasks

- [x] 1. Write bug condition exploration test
  - [x] 1.1 Create `src/workers/marketLockout.bugexplore.test.ts`
  - [x] 1.2 Mock the BullMQ queue's `add` method to capture scheduled jobs
  - [x] 1.3 Call `scheduleMarketLockout` with a market that has `open_result_time` set and both lock times in the future
  - [x] 1.4 Assert that NO job with `action='open-lock'` is scheduled (confirms bug)
  - [x] 1.5 Assert that exactly ONE job is scheduled total (the close-lock only)

- [x] 2. Add `open_session_locked` column to database schema
  - [x] 2.1 Add `open_session_locked Boolean @default(false)` field to `Market` model in `prisma/schema.prisma`
  - [x] 2.2 Run `prisma migrate dev --name add_open_session_locked` to generate migration
  - [x] 2.3 Verify migration SQL contains the correct ALTER TABLE statement

- [x] 3. Update `marketLockout.ts` — types and scheduling
  - [x] 3.1 Update `MarketLockoutJobData` interface action type
  - [x] 3.2 Update `MarketScheduleInput` interface with new fields
  - [x] 3.3 Add `getOpenLockoutTime` helper function
  - [x] 3.4 Rewrite `scheduleMarketLockout` to schedule two jobs
  - [x] 3.5 Update `scheduleAllMarketLockouts` to select new fields from DB

- [x] 4. Update `marketLockout.ts` — processing logic
  - [x] 4.1 Add `processOpenSessionLock` function
  - [x] 4.2 Refactor `processMarketLockout` to `processCloseSessionLock` with close_time fix
  - [x] 4.3 Update BullMQ worker processor routing

- [x] 5. Fix open-session lock check in `bets.service.ts`
  - [x] 5.1 Remove the incorrect time-arithmetic open-session lock check
  - [x] 5.2 Replace with DB-state check using `open_session_locked`
  - [x] 5.3 Verify `prisma.market.findUnique` includes `open_session_locked` field

- [x] 6. Update `dailyReset.ts` to reset `open_session_locked`
  - [x] 6.1 Add `open_session_locked: false` to the `updateMany` data payload

- [ ] 7. Write unit tests for updated worker
  - [ ] 7.1 Update/create `src/workers/marketLockout.test.ts`
  - [ ] 7.2 Test: `scheduleMarketLockout` schedules exactly 2 jobs when both lock times are in the future
  - [ ] 7.3 Test: `scheduleMarketLockout` skips open-lock job if `open_result_time − 20 min` has already passed
  - [ ] 7.4 Test: `scheduleMarketLockout` skips close-lock job if `close_time − 20 min` has already passed
  - [ ] 7.5 Test: `processOpenSessionLock` sets `open_session_locked = true` and publishes `market:open-locked`
  - [ ] 7.6 Test: `processCloseSessionLock` uses `close_time` (not `result_time`) for the guard
  - [ ] 7.7 Test: `processCloseSessionLock` sets `status = 'locked'` and publishes `market:locked`
  - [ ] 7.8 Test: open-lock job ID format is `market-open-lock:<id>:<date>`
  - [ ] 7.9 Test: close-lock job ID format is `market-close-lock:<id>:<date>`

- [ ] 8. Write integration tests for bet service session lock
  - [ ] 8.1 Update `src/api/bets/bets.service.test.ts`
  - [ ] 8.2 Test: open-session bet is rejected when `market.open_session_locked = true`
  - [ ] 8.3 Test: close-session bet is accepted when `market.open_session_locked = true` but `market.status = 'open'`
  - [ ] 8.4 Test: all bets rejected when `market.status = 'locked'`
  - [ ] 8.5 Test: open-session bet accepted when `market.open_session_locked = false` and `market.status = 'open'`

## Task Dependency Graph

```
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
```

## Notes

- Bug exploration test (Task 1) confirmed: only 1 job scheduled on unfixed code, no `open-lock` action
- Migration applied: `open_session_locked BOOLEAN NOT NULL DEFAULT false` added to `markets` table
- `dailyReset.ts` midnight reset now includes `open_session_locked: false`
- TypeScript build passes with zero errors after all changes
