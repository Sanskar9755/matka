# Requirements: Admin Point Allocation

## Overview

This feature introduces a two-tier point credit system. The Superadmin allocates a point budget to each Admin. Admins use that budget to directly credit points into user wallets — no UPI or deposit flow involved. Every allocation and grant is recorded with a full audit trail.

---

## Requirements

### 1. Superadmin Point Allocation

#### 1.1 Allocate Points to Admin

**User Story**: As a Superadmin, I want to allocate a point budget to any Admin so that the Admin can distribute those points to their users.

**Acceptance Criteria**:
- WHEN the Superadmin submits a valid allocation request with `admin_id` and `amount > 0`, THEN `Admin.allocated_points` increases by exactly `amount` and one `AdminPointAllocation` row is created.
- WHEN `amount <= 0` or is not a positive integer, THEN the request is rejected with HTTP 400 and error code `INVALID_AMOUNT`.
- WHEN `admin_id` does not reference an existing, active admin, THEN the request is rejected with HTTP 404 and error code `NOT_FOUND`.
- WHEN the allocation succeeds, THEN the response includes the new `AdminPointAllocation` record and the admin's updated balance (`allocated_points`, `used_points`, `available_points`).
- WHEN the allocation succeeds, THEN `Admin.used_points` is unchanged.

#### 1.2 View Allocation History

**User Story**: As a Superadmin, I want to see the full history of all point allocations I have made to admins so that I can audit the distribution of points.

**Acceptance Criteria**:
- WHEN the Superadmin requests allocation history, THEN the response returns all `AdminPointAllocation` records ordered by `created_at DESC`.
- WHEN a `admin_id` filter is provided, THEN only allocations for that admin are returned.
- WHEN pagination parameters (`limit`, `offset`) are provided, THEN the response is paginated accordingly and includes a `total` count.
- WHEN no allocations exist, THEN an empty array is returned (not an error).
- Each record MUST include: `id`, `admin_id`, `admin_username`, `allocated_by`, `amount_points`, `note`, `created_at`.

#### 1.3 View Admin Balances

**User Story**: As a Superadmin, I want to see each admin's current `allocated_points`, `used_points`, and `available_points` so that I can decide how much more to allocate.

**Acceptance Criteria**:
- WHEN the Superadmin requests admin balances, THEN the response includes all admins with `allocated_points`, `used_points`, and `available_points` for each.
- `available_points` MUST always equal `allocated_points - used_points`.
- The list MUST include admins with zero allocation (showing `0 / 0 / 0`).

---

### 2. Admin Point Grant

#### 2.1 Grant Points to User

**User Story**: As an Admin, I want to directly add points to any user under me so that I can credit them without requiring a UPI deposit.

**Acceptance Criteria**:
- WHEN the Admin submits a valid grant request with `user_id` and `amount > 0`, THEN `User.wallet.balance_points` increases by exactly `amount`, `Admin.used_points` increases by exactly `amount`, one `AdminPointGrant` row is created, and one `Transaction` row with `type = admin_credit` and `status = completed` is created.
- WHEN `amount <= 0` or is not a positive integer, THEN the request is rejected with HTTP 400 and error code `INVALID_AMOUNT`.
- WHEN `user_id` does not belong to the requesting Admin, THEN the request is rejected with HTTP 403 and error code `FORBIDDEN`.
- WHEN `amount > (Admin.allocated_points - Admin.used_points)`, THEN the request is rejected with HTTP 400 and error code `INSUFFICIENT_ADMIN_BALANCE`.
- WHEN the grant succeeds, THEN the response includes the `AdminPointGrant` record and the user's `wallet_balance_after`.
- All four writes (admin used_points, wallet balance, grant record, transaction record) MUST be atomic — either all succeed or all fail.

#### 2.2 View Grant History

**User Story**: As an Admin, I want to see the history of all points I have granted to users so that I can track my distributions.

**Acceptance Criteria**:
- WHEN the Admin requests grant history, THEN only grants made by that Admin are returned (scoped — no cross-admin visibility).
- Records are ordered by `created_at DESC`.
- WHEN a `user_id` filter is provided, THEN only grants to that user are returned.
- WHEN pagination parameters are provided, THEN the response is paginated and includes a `total` count.
- Each record MUST include: `id`, `admin_id`, `user_id`, `user_username`, `amount_points`, `note`, `created_at`.

#### 2.3 View Own Balance

**User Story**: As an Admin, I want to see my current `allocated_points`, `used_points`, and `available_points` so that I know how many points I can still distribute.

**Acceptance Criteria**:
- WHEN the Admin requests their balance, THEN the response includes `allocated_points`, `used_points`, and `available_points`.
- `available_points` MUST equal `allocated_points - used_points`.
- The balance reflects the state after all committed grants (no stale reads).

---

### 3. Business Rules

#### 3.1 Allocation is Additive

**Acceptance Criteria**:
- WHEN the Superadmin allocates points to an Admin multiple times, THEN `Admin.allocated_points` equals the sum of all allocation amounts.
- `Admin.allocated_points` MUST never decrease (allocations are additive only).

#### 3.2 No Overdraft

**Acceptance Criteria**:
- WHEN an Admin attempts to grant points, THEN the system MUST verify `amount <= (allocated_points - used_points)` inside the same database transaction as the write.
- Under concurrent grant requests, at most one request succeeds if together they would exceed the available balance.

#### 3.3 Audit Trail Completeness

**Acceptance Criteria**:
- Every successful `allocatePointsToAdmin` call MUST produce exactly one `AdminPointAllocation` row with `admin_id`, `allocated_by`, `amount_points`, and `created_at`.
- Every successful `grantPointsToUser` call MUST produce exactly one `AdminPointGrant` row and exactly one `Transaction` row with `type = admin_credit`, `approved_by = admin_id`, and `status = completed`.

---

### 4. Schema & API

#### 4.1 Admin Model Extension

**Acceptance Criteria**:
- The `Admin` model MUST have `allocated_points BigInt @default(0)` and `used_points BigInt @default(0)` fields.
- A Prisma migration MUST be created for these new fields.
- Existing admin records MUST default to `0` for both fields after migration.

#### 4.2 New Tables

**Acceptance Criteria**:
- An `AdminPointAllocation` table MUST exist with fields: `id`, `admin_id`, `allocated_by`, `amount_points`, `note`, `created_at`.
- An `AdminPointGrant` table MUST exist with fields: `id`, `admin_id`, `user_id`, `amount_points`, `note`, `created_at`.
- Both tables MUST have an index on `admin_id`.
- The `TransactionType` enum MUST include `admin_credit`.

#### 4.3 Superadmin API Endpoints

**Acceptance Criteria**:
- `POST /api/superadmin/points/allocate` — allocate points to an admin (body: `{ admin_id, amount, note? }`)
- `GET /api/superadmin/points/history` — list all allocation history (query: `admin_id?`, `limit?`, `offset?`)
- `GET /api/superadmin/points/balances` — list all admin balances
- All endpoints MUST require `Role.SuperAdmin` authentication.
- All endpoints MUST return `{ data: ... }` envelope consistent with existing API conventions.

#### 4.4 Admin API Endpoints

**Acceptance Criteria**:
- `POST /api/admin/points/grant` — grant points to a user (body: `{ user_id, amount, note? }`)
- `GET /api/admin/points/history` — list grant history for the authenticated admin (query: `user_id?`, `limit?`, `offset?`)
- `GET /api/admin/points/balance` — get the authenticated admin's balance
- All endpoints MUST require `Role.Admin` authentication.
- All endpoints MUST return `{ data: ... }` envelope consistent with existing API conventions.

---

### 5. Frontend

#### 5.1 Superadmin Points Panel

**Acceptance Criteria**:
- A new page at `/superadmin/points` MUST be accessible from the SuperAdmin navigation.
- The page MUST display a table of all admins showing `username`, `allocated_points`, `used_points`, `available_points`.
- The page MUST include an "Allocate Points" form with: admin selector (dropdown), amount input, optional note input, and a submit button.
- WHEN allocation succeeds, THEN the admin balance table updates to reflect the new allocation.
- WHEN allocation fails, THEN an error message is displayed inline.
- The page MUST display a history table showing all past allocations: `admin_username`, `amount_points`, `note`, `created_at`.

#### 5.2 Admin Points Panel

**Acceptance Criteria**:
- A new page at `/admin/points` MUST be accessible from the Admin navigation.
- The page MUST display the admin's own balance card showing `allocated_points`, `used_points`, `available_points`.
- The page MUST include an "Add Points to User" form with: user selector (dropdown of users under this admin), amount input, optional note input, and a submit button.
- WHEN the grant succeeds, THEN the balance card updates and a success message is shown.
- WHEN the grant fails due to insufficient balance, THEN the error message clearly states the available balance.
- The page MUST display a history table showing all past grants: `user_username`, `amount_points`, `note`, `created_at`.
