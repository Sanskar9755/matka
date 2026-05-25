# Bugfix Requirements Document

## Introduction

The Matka game platform supports two betting sessions per market — **Open** and **Close** — each with its own result time. Currently, the `marketLockout.ts` worker only schedules a single lock event based on `close_time − 20 minutes`, and the `processMarketLockout` function incorrectly uses `result_time` instead of `close_time` for its lockout calculation. This means the Open session has no independent lock, allowing bets to be placed past the intended Open lock deadline. The fix introduces two independent, session-specific lock schedules: one for the Open session (`open_result_time − 20 min`) and one for the Close session (`close_time − 20 min`), both resetting at midnight via the existing `dailyReset.ts` worker.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a market's `open_result_time` is approaching (within 20 minutes) THEN the system does NOT lock the open session — open bets continue to be accepted past the intended cutoff

1.2 WHEN `processMarketLockout` calculates the lockout time THEN the system uses `market.result_time` instead of `market.close_time`, producing an inconsistent and incorrect lock schedule for the close session

1.3 WHEN the market status transitions to `locked` THEN the system sets a single global `locked` status that does not distinguish between open-session-locked and close-session-locked states, making it impossible to accept close bets while open bets are locked

1.4 WHEN `scheduleMarketLockout` is called THEN the system schedules only one delayed job (based on `close_time`) and skips scheduling any job for `open_result_time`

### Expected Behavior (Correct)

2.1 WHEN a market's `open_result_time − 20 minutes` is reached THEN the system SHALL lock the open session so that no further open-session bets are accepted for that market on that day

2.2 WHEN a market's `close_time − 20 minutes` is reached THEN the system SHALL lock the close session so that no further close-session bets are accepted for that market on that day

2.3 WHEN `processMarketLockout` calculates the close-session lockout time THEN the system SHALL use `market.close_time` (not `result_time`) as the reference time for the close lock schedule

2.4 WHEN `scheduleMarketLockout` is called for a market THEN the system SHALL schedule two independent delayed jobs — one for the open-session lock (`open_result_time − 20 min`) and one for the close-session lock (`close_time − 20 min`)

2.5 WHEN the open session is locked but the close session is not yet locked THEN the system SHALL continue to accept close-session bets while rejecting open-session bets

### Unchanged Behavior (Regression Prevention)

3.1 WHEN midnight passes THEN the system SHALL CONTINUE TO reset all active market statuses to `open` via the existing `dailyReset.ts` worker, unlocking both sessions for the new day

3.2 WHEN a market's `close_time − 20 minutes` is reached THEN the system SHALL CONTINUE TO publish a `market:locked` event on the market's Redis pub/sub channel

3.3 WHEN a market is not active (`is_active = false`) THEN the system SHALL CONTINUE TO skip scheduling any lockout jobs for that market

3.4 WHEN the lockout time for a session has already passed at server startup THEN the system SHALL CONTINUE TO skip scheduling a job for that session on the current day

3.5 WHEN a market is locked or closed THEN the system SHALL CONTINUE TO schedule a close job after `result_time + 1 minute` to transition the market to `closed` status for the day

3.6 WHEN `scheduleAllMarketLockouts` is called on server startup THEN the system SHALL CONTINUE TO iterate all active markets and schedule their respective lockout jobs

---

## Bug Condition Pseudocode

### Bug Condition Function

```pascal
FUNCTION isBugCondition(market)
  INPUT: market of type MarketScheduleInput
  OUTPUT: boolean

  // Bug is triggered when a market has a valid open_result_time
  // but no independent open-session lock job is scheduled
  RETURN market.open_result_time IS NOT NULL
     AND market.open_result_time <> ""
     AND market.is_active = true
END FUNCTION
```

### Fix Checking Property

```pascal
// Property: Open Session Lock is Independently Scheduled
FOR ALL market WHERE isBugCondition(market) DO
  jobs ← getScheduledJobs(market.id)
  openLockJob ← jobs WHERE job.type = "open-lock"
  ASSERT openLockJob EXISTS
  ASSERT openLockJob.scheduledAt = getTodayAt(market.open_result_time) - 20 minutes
END FOR
```

### Preservation Checking Property

```pascal
// Property: Close Session Lock Remains Correctly Scheduled
FOR ALL market WHERE NOT isBugCondition(market) DO
  jobs ← getScheduledJobs(market.id)
  closeLockJob ← jobs WHERE job.type = "close-lock"
  ASSERT closeLockJob.scheduledAt = getTodayAt(market.close_time) - 20 minutes
  // F(market) = F'(market) for close-lock scheduling
END FOR
```
