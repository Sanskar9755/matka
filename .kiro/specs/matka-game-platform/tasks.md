# Implementation Plan: Matka Game Platform

## Overview

Implement the Matka Game Platform as a TypeScript monorepo with an Express/Prisma/PostgreSQL backend, React/Vite/TailwindCSS frontend, BullMQ workers, and Socket.IO real-time layer. Tasks are ordered to build foundational infrastructure first, then core domain logic, then UI panels, and finally integration wiring.

## Tasks

- [x] 1. Initialize monorepo structure and shared configuration
  - Create `packages/backend` and `packages/frontend` directories with `package.json` files
  - Configure root-level `tsconfig.json` with path aliases; extend per-package
  - Add `packages/backend/src/types/index.ts` with all shared TypeScript enums and interfaces (`Role`, `BetType`, `TransactionType`, `TransactionStatus`, `MarketStatus`, `BetOutcome`, and all entity types)
  - Set up Vitest config for backend unit tests and fast-check as a dev dependency
  - Set up Vite + React 18 + TailwindCSS for frontend
  - _Requirements: 1.9, 11.1_

- [ ] 2. Database schema and Prisma setup
  - [x] 2.1 Write Prisma schema (`schema.prisma`) with all models: `User`, `Admin`, `Wallet`, `Transaction`, `Market`, `Bet`, `ResultCycle`, `PlatformConfig`
    - Include all enums, relations, and field constraints from the data model
    - Add all database indexes from the design (`idx_bets_user_id`, `idx_bets_market_id_cycle`, `idx_bets_outcome`, `idx_transactions_user_id`, `idx_transactions_status`, `idx_markets_status`, `idx_result_cycles_market_date`)
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 2.2 Create initial migration and seed script
    - Generate and apply the initial Prisma migration
    - Write a seed script that creates the SuperAdmin account and default `PlatformConfig` row with default winning multipliers
    - _Requirements: 9.4, 6.4_

- [x] 3. Backend infrastructure: Redis, BullMQ, and Prisma singletons
  - Create `src/lib/prisma.ts` (Prisma client singleton)
  - Create `src/lib/redis.ts` (Redis client singleton using `ioredis`)
  - Create `src/lib/bullmq.ts` (queue and worker factory helpers)
  - Create `src/middleware/errorHandler.ts` (global Express error handler returning the standard error envelope)
  - _Requirements: 6.1, 6.6, 10.1_

- [ ] 4. Authentication module
  - [x] 4.1 Implement auth service (`src/api/auth/auth.service.ts`)
    - `register(username, password, referralCode)` — validates referral code, hashes password with bcrypt, creates `User` + `Wallet` rows in a transaction, permanently sets `admin_id`
    - `login(username, password)` — validates credentials, issues JWT access token (15 min) + refresh token (7 days)
    - `refreshToken(token)` — validates refresh token, issues new access token
    - `changePassword(userId, currentPassword, newPassword)` — validates current password, enforces 8-char minimum, updates hash
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3_

  - [ ]* 4.2 Write property test for referral code uniqueness and permanent user association
    - **Property 5: Referral code uniqueness and permanent user association**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - Tag: `Feature: matka-game-platform, Property 5: referral code uniqueness and permanent user association`

  - [x] 4.3 Implement auth middleware (`src/middleware/auth.ts`)
    - `authenticate` — verifies JWT, attaches `{ userId, role, adminId }` to `req.user`
    - `requireRole(...roles)` — factory returning a guard middleware that returns 403 if `req.user.role` is not in the allowed set
    - _Requirements: 1.9_

  - [ ]* 4.4 Write property test for role-based access isolation
    - **Property 8: Role-based access isolation**
    - **Validates: Requirements 1.9**
    - Tag: `Feature: matka-game-platform, Property 8: role-based access isolation`

  - [x] 4.5 Implement auth routes (`src/api/auth/auth.router.ts`) and wire into Express app
    - `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/change-password`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.7_

  - [ ]* 4.6 Write unit tests for auth service
    - Test registration with invalid referral code returns error
    - Test login with wrong password returns error
    - Test password change rejects passwords shorter than 8 characters
    - _Requirements: 1.2, 1.6, 1.8_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Market management module
  - [x] 6.1 Implement market service (`src/api/markets/markets.service.ts`)
    - `createMarket(data)` — creates market with name, open_time, close_time, result_time
    - `updateMarket(id, data)` — updates market fields; triggers lockout job reschedule
    - `setMarketStatus(id, status)` — activates or deactivates a market
    - `listActiveMarkets()` — returns all active markets with computed current status (`open | locked | closed`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 6.2 Implement market routes (`src/api/markets/markets.router.ts`)
    - `GET /api/markets` (any auth), `POST /api/markets` (SuperAdmin), `PUT /api/markets/:id` (SuperAdmin), `PATCH /api/markets/:id/status` (SuperAdmin)
    - _Requirements: 3.1, 3.2_

  - [ ]* 6.3 Write unit tests for market service
    - Test `listActiveMarkets` correctly computes `open`, `locked`, and `closed` status based on current time
    - Test creating a market with missing required fields returns validation error
    - _Requirements: 3.3, 3.4, 3.5_

- [ ] 7. Wallet and payment module
  - [x] 7.1 Implement wallet service (`src/api/wallet/wallet.service.ts`)
    - `getBalance(userId)` — returns `balance_points` and `held_points`
    - `submitDeposit(userId, upiRef, amountPoints)` — creates pending `Transaction` of type `deposit`
    - `submitWithdrawal(userId, amountPoints)` — validates available balance, creates pending `Transaction` of type `withdrawal`, increments `held_points` atomically
    - `getTransactionHistory(userId)` — returns all transactions for user
    - _Requirements: 7.1, 7.3, 7.4, 7.7_

  - [ ]* 7.2 Write property test for withdrawal hold invariant
    - **Property 6: Withdrawal hold invariant**
    - **Validates: Requirements 7.3, 7.4, 7.6**
    - Tag: `Feature: matka-game-platform, Property 6: withdrawal hold invariant`

  - [x] 7.3 Implement wallet routes (`src/api/wallet/wallet.router.ts`)
    - `GET /api/wallet/balance`, `POST /api/wallet/deposit`, `POST /api/wallet/withdraw`, `GET /api/wallet/transactions`
    - _Requirements: 7.1, 7.3, 7.4_

  - [ ]* 7.4 Write unit tests for wallet service
    - Test withdrawal request exceeding available balance is rejected with `WITHDRAWAL_EXCEEDS_BALANCE`
    - Test `held_points` is incremented correctly on withdrawal request
    - _Requirements: 7.3, 7.4_

- [ ] 8. Bet placement module
  - [x] 8.1 Implement bet service (`src/api/bets/bets.service.ts`)
    - `placeBet(userId, marketId, betType, selection, points)` — validates market is open (not locked/closed), validates selection format per bet type, checks min/max bet limits from admin config, checks wallet balance, atomically deducts wallet and inserts bet record in a single PostgreSQL transaction
    - `getBetHistory(userId)` — returns all bets for user with market name, bet type, points, outcome
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 12.1, 12.2_

  - [ ]* 8.2 Write property test for market lockout boundary enforcement
    - **Property 4: Market lockout boundary enforcement**
    - **Validates: Requirements 3.3, 3.4, 4.7**
    - Tag: `Feature: matka-game-platform, Property 4: market lockout boundary enforcement`

  - [ ]* 8.3 Write property test for bet record immutability and uniqueness
    - **Property 3: Bet record immutability and uniqueness**
    - **Validates: Requirements 12.1, 12.2**
    - Tag: `Feature: matka-game-platform, Property 3: bet record immutability and uniqueness`

  - [x] 8.4 Implement bet routes (`src/api/bets/bets.router.ts`)
    - `POST /api/bets` (User), `GET /api/bets/my` (User)
    - _Requirements: 4.5, 5.1_

  - [ ]* 8.5 Write unit tests for bet service
    - Test bet below minimum is rejected with `BET_BELOW_MINIMUM`
    - Test bet above maximum is rejected with `BET_ABOVE_MAXIMUM`
    - Test bet on locked market is rejected with `MARKET_LOCKED`
    - Test bet with insufficient balance is rejected with `INSUFFICIENT_BALANCE`
    - Test invalid selection string is rejected with `INVALID_SELECTION`
    - _Requirements: 4.3, 4.4, 4.6, 4.7_

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Winning calculation and result system
  - [x] 10.1 Implement bet matching logic (`src/workers/betMatcher.ts`)
    - Pure function `matchBet(bet, result)` implementing all 7 bet type win conditions from the design
    - Handles Single, Jodi, Single Panna, Double Panna, Triple Panna, Half Sangam, Full Sangam
    - _Requirements: 6.3_

  - [ ]* 10.2 Write property test for bet matching correctness
    - **Property 9: Bet matching correctness**
    - **Validates: Requirements 6.3**
    - Tag: `Feature: matka-game-platform, Property 9: bet matching correctness`

  - [x] 10.3 Implement winning calculation worker (`src/workers/winningCalculation.ts`)
    - Processes one `winning-calculation` job at a time
    - Acquires PostgreSQL advisory lock on `(market_id, result_cycle_id)` to guarantee idempotency
    - Fetches all pending bets for the cycle, calls `matchBet` for each, credits winning wallets and records `winning_credit` transactions, sets `calculation_done = true` — all in a single transaction
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 12.4_

  - [ ]* 10.4 Write property test for idempotent winning calculation
    - **Property 2: Idempotent winning calculation**
    - **Validates: Requirements 6.5, 12.4**
    - Tag: `Feature: matka-game-platform, Property 2: idempotent winning calculation`

  - [ ]* 10.5 Write property test for winning amount calculation correctness
    - **Property 7: Winning amount calculation correctness**
    - **Validates: Requirements 6.4**
    - Tag: `Feature: matka-game-platform, Property 7: winning amount calculation correctness`

  - [ ]* 10.6 Write property test for wallet balance conservation
    - **Property 1: Wallet balance conservation**
    - **Validates: Requirements 12.5, 7.2, 7.5**
    - Tag: `Feature: matka-game-platform, Property 1: wallet balance conservation`

  - [ ]* 10.7 Write unit tests for winning calculation worker
    - Test all 7 bet types against known result fixtures (win and loss cases)
    - Test `calculation_done = true` prevents re-processing
    - _Requirements: 6.3, 6.5_

- [ ] 11. Result poller worker
  - [x] 11.1 Implement result poller worker (`src/workers/resultPoller.ts`)
    - Scheduled repeatable BullMQ job (interval from `PlatformConfig.result_poll_interval_sec`)
    - Fetches results from `PlatformConfig.result_api_endpoint` for each active market
    - Stores result in `ResultCycle` row (upsert by `market_id + cycle_date`)
    - Enqueues a `winning-calculation` job for each new result
    - On HTTP error: logs failure with market ID and timestamp, increments Redis failure counter; after 5 consecutive failures emits alert log
    - _Requirements: 6.1, 6.2, 6.6_

  - [ ]* 11.2 Write integration test for result poller
    - Mock the Result API with a known response; verify the poller stores the result and enqueues a winning-calculation job
    - _Requirements: 6.1, 6.2_

- [ ] 12. Market lockout scheduler worker
  - [x] 12.1 Implement market lockout worker (`src/workers/marketLockout.ts`)
    - On server startup and after any market create/edit, schedules a BullMQ delayed job for each market's lockout time (`result_time − 20 minutes`)
    - Job handler sets `market.status = 'locked'` and publishes a `market:locked` event to Redis Pub/Sub
    - On late fire (server restart), checks current time against lockout time and applies lock if still applicable
    - _Requirements: 3.4, 3.5, 10.3_

  - [ ]* 12.2 Write integration test for market lockout scheduler
    - Verify a BullMQ delayed job fires and sets market status to `'locked'` at the correct time
    - _Requirements: 3.4_

- [ ] 13. Admin transaction approval module
  - [x] 13.1 Implement admin service (`src/api/admin/admin.service.ts`)
    - `listUsers(adminId)` — returns all users under this admin
    - `getUserProfile(adminId, userId)` — returns user profile (validates ownership)
    - `listPendingTransactions(adminId)` — returns pending deposit/withdrawal transactions for admin's users
    - `approveTransaction(adminId, transactionId)` — for deposit: credits wallet and records `deposit` transaction; for withdrawal: deducts `held_points` and `balance_points`, marks completed — all atomic
    - `rejectTransaction(adminId, transactionId)` — for withdrawal: releases `held_points`; marks transaction rejected
    - `updateBetLimits(adminId, min, max)` — updates admin's `min_bet_points` and `max_bet_points`
    - _Requirements: 7.2, 7.5, 7.6, 8.1, 8.2, 8.3, 8.6, 8.7_

  - [ ]* 13.2 Write unit tests for admin transaction approval
    - Test deposit approval credits correct points to wallet
    - Test withdrawal approval deducts held_points and balance_points atomically
    - Test withdrawal rejection releases held_points
    - _Requirements: 7.2, 7.5, 7.6_

  - [x] 13.3 Implement admin routes (`src/api/admin/admin.router.ts`)
    - `GET /api/admin/users`, `GET /api/admin/users/:id`, `GET /api/admin/transactions/pending`, `POST /api/admin/transactions/:id/approve`, `POST /api/admin/transactions/:id/reject`, `GET /api/admin/dashboard/:marketId`, `PUT /api/admin/settings/bet-limits`
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 8.7_

- [ ] 14. SuperAdmin module
  - [x] 14.1 Implement superadmin service (`src/api/superadmin/superadmin.service.ts`)
    - `createAdmin(data)` — creates admin with auto-generated unique referral code
    - `updateAdmin(id, data)` — updates admin fields
    - `setAdminStatus(id, isActive)` — activates or deactivates admin
    - `listAdmins()` — returns all admin accounts
    - `getAnalytics()` — returns total users, total deposited, total withdrawn, platform revenue
    - `getConfig()` / `updateConfig(data)` — reads and writes `PlatformConfig`
    - `manuallyEnterResult(marketId, resultData)` — inserts/updates `ResultCycle` and enqueues winning-calculation job
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 6.7_

  - [x] 14.2 Implement superadmin routes (`src/api/superadmin/superadmin.router.ts`)
    - `GET /api/superadmin/admins`, `POST /api/superadmin/admins`, `PUT /api/superadmin/admins/:id`, `PATCH /api/superadmin/admins/:id/status`, `GET /api/superadmin/analytics`, `GET /api/superadmin/config`, `PUT /api/superadmin/config`, `POST /api/superadmin/results/:marketId`
    - _Requirements: 9.1, 9.4, 9.7, 6.7_

- [x] 15. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Real-time layer (Socket.IO + Redis Pub/Sub)
  - [x] 16.1 Implement Redis Pub/Sub helpers (`src/realtime/pubsub.ts`)
    - `publish(channel, payload)` — publishes JSON payload to a Redis channel
    - `subscribe(channel, handler)` — subscribes to a Redis channel and calls handler with parsed payload
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 16.2 Implement Socket.IO server (`src/realtime/socketServer.ts`)
    - Authenticate Socket.IO connections using JWT (same middleware as REST)
    - Handle `join:market`, `leave:market`, `join:admin-dashboard` client events; manage rooms
    - Subscribe to Redis Pub/Sub channels and broadcast `bet:new`, `bet:totals`, `market:locked`, `market:result` events to the correct rooms
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 16.3 Wire bet placement to publish real-time events
    - After a successful bet placement, if the market is in the pre-result window (within 20 min of result_time), publish `bet:new` and updated `bet:totals` to `admin:{adminId}` channel
    - _Requirements: 8.4, 8.5, 10.2_

  - [ ]* 16.4 Write property test for running bet totals correctness
    - **Property 10: Running bet totals correctness**
    - **Validates: Requirements 8.5**
    - Tag: `Feature: matka-game-platform, Property 10: running bet totals correctness`

  - [ ]* 16.5 Write integration test for Socket.IO broadcast
    - Verify that a bet placed during the pre-result window triggers a `bet:new` event on the admin's room within 3 seconds
    - _Requirements: 10.2_

- [ ] 17. Frontend: project setup and shared components
  - [x] 17.1 Set up React Router with role-based redirect
    - Configure routes for `/login`, `/register`, `/user/*`, `/admin/*`, `/superadmin/*`
    - Implement `ProtectedRoute` component that reads JWT role claim and redirects to the correct panel; unauthenticated users are redirected to `/login`
    - _Requirements: 1.3, 1.4, 1.5, 11.4_

  - [x] 17.2 Implement shared UI primitives
    - `BottomNav` component with 44×44px touch targets for User panel primary actions
    - `WalletBadge` component displaying current balance (always visible when authenticated)
    - `ErrorBanner` and `LoadingSpinner` components
    - TailwindCSS responsive base styles (320px–1920px breakpoints)
    - _Requirements: 11.1, 11.2, 4.8_

  - [x] 17.3 Implement auth pages (`/login`, `/register`)
    - Login form: username + password, role-based redirect on success
    - Register form: username + password + referral code, inline validation errors
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

- [ ] 18. Frontend: User panel
  - [x] 18.1 Implement game lobby page (`/user/lobby`)
    - Fetch and display all active markets with open/close times and computed status badge (open / locked / closed)
    - Subscribe to `market:locked` Socket.IO event to update status in real time without refresh
    - _Requirements: 4.1, 3.5_

  - [x] 18.2 Implement bet placement page (`/user/bet/:marketId`)
    - Display all 7 bet types as selectable tabs
    - Points input with client-side min/max validation against admin limits
    - Submit bet via `POST /api/bets`; show success confirmation or error message
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 18.3 Implement bet history page (`/user/history`)
    - Chronological list of bets with market name, bet type, points, outcome badge (pending / win / loss)
    - _Requirements: 5.1, 5.2_

  - [x] 18.4 Implement wallet page (`/user/wallet`)
    - Display balance and held points
    - Deposit form (UPI ref + amount) and withdrawal form (amount)
    - Transaction history list
    - _Requirements: 7.1, 7.3, 7.4, 4.8, 5.3_

- [ ] 19. Frontend: Admin panel
  - [x] 19.1 Implement user management page (`/admin/users`)
    - List of users under this admin with profile link
    - _Requirements: 8.1, 8.7_

  - [x] 19.2 Implement transaction approval page (`/admin/transactions`)
    - List of pending deposit and withdrawal transactions
    - Approve / Reject buttons; optimistic UI update on action
    - _Requirements: 8.2, 8.3_

  - [x] 19.3 Implement live bet dashboard page (`/admin/dashboard/:marketId`)
    - Snapshot of current bets from `GET /api/admin/dashboard/:marketId`
    - Subscribe to `bet:new` and `bet:totals` Socket.IO events; append new bets and update totals in real time
    - Display running totals per bet type
    - _Requirements: 8.4, 8.5, 10.1, 10.2_

  - [x] 19.4 Implement bet limits settings page (`/admin/settings`)
    - Form to update min/max bet points; calls `PUT /api/admin/settings/bet-limits`
    - Display admin's referral link
    - _Requirements: 8.6, 2.4_

- [ ] 20. Frontend: SuperAdmin panel
  - [x] 20.1 Implement admin management page (`/superadmin/admins`)
    - List of all admins with create, edit, activate/deactivate actions
    - _Requirements: 9.1_

  - [x] 20.2 Implement analytics page (`/superadmin/analytics`)
    - Display total users, total deposited, total withdrawn, platform revenue
    - _Requirements: 9.2, 9.3_

  - [x] 20.3 Implement platform config page (`/superadmin/config`)
    - Form to update winning multipliers per bet type, UPI details, Result API endpoint and polling interval, feature toggles
    - _Requirements: 9.4, 9.5, 9.6, 9.7_

  - [x] 20.4 Implement market management page (`/superadmin/markets`)
    - List of all markets with create, edit, activate/deactivate actions
    - Manual result entry form per market
    - _Requirements: 3.1, 3.2, 6.7_

- [x] 21. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties using fast-check (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- The backend uses TypeScript with Express, Prisma, PostgreSQL, Redis, BullMQ, and Socket.IO
- The frontend uses React 18, TypeScript, Vite, and TailwindCSS
