# Requirements Document

## Introduction

A web-based Matka/Number game platform with a mobile-first design, supporting three distinct roles: SuperAdmin (platform owner), Admin (game operators / "khilane wale"), and User (players). The platform supports all standard Matka game markets and bet types, a UPI-based wallet system, automatic result fetching via API, automatic winning calculation, and real-time bet tracking with a 20-minute pre-result lockout mechanism.

---

## Glossary

- **Platform**: The Matka/Number game web application as a whole.
- **SuperAdmin**: The platform owner with full control over all data, accounts, settings, and results.
- **Admin**: A game operator who manages a group of users acquired via a unique referral link.
- **User**: A registered player who places bets and manages their wallet.
- **Market**: A named Matka game (e.g., Kalyan, Milan Day, Main Bazar). Each market has a fixed open time and close time.
- **Bet**: A wager placed by a User on a specific Market using a chosen Bet_Type and a points amount.
- **Bet_Type**: One of the seven wagering categories: Single, Jodi, Single Panna, Double Panna, Triple Panna, Half Sangam, Full Sangam.
- **Points**: The in-platform currency unit used for placing bets and tracking wallet balance.
- **Wallet**: A User's in-platform balance denominated in Points.
- **Result**: The declared winning number(s) for a Market, fetched automatically via the Result_API.
- **Result_API**: The external API used to fetch Market results automatically.
- **Lockout_Time**: The point in time 20 minutes before a Market's result declaration time, after which no new bets are accepted.
- **Referral_Link**: A unique URL assigned to each Admin; Users who register via this link are automatically associated with that Admin.
- **UPI**: Unified Payments Interface — the payment method used for deposits and withdrawals.
- **Transaction**: A record of a deposit, withdrawal, bet placement, or winning credit affecting a Wallet.
- **Winning_Multiplier**: The payout ratio for each Bet_Type, configured by the SuperAdmin.
- **Role**: One of three access levels: SuperAdmin, Admin, or User.

---

## Requirements

### Requirement 1: User Registration and Authentication

**User Story:** As a visitor, I want to register and log in with a username and password, so that I can access the platform and place bets.

#### Acceptance Criteria

1. WHEN a visitor submits a registration form with a valid username, password, and a valid Referral_Link, THE Authentication_System SHALL create a new User account and associate it with the Admin who owns that Referral_Link.
2. WHEN a visitor submits a registration form with a Referral_Link that does not correspond to any active Admin, THEN THE Authentication_System SHALL reject the registration and return a descriptive error message.
3. WHEN a registered User submits valid credentials, THE Authentication_System SHALL authenticate the User and redirect them to the User Panel.
4. WHEN a registered Admin submits valid credentials, THE Authentication_System SHALL authenticate the Admin and redirect them to the Admin Panel.
5. WHEN a registered SuperAdmin submits valid credentials, THE Authentication_System SHALL authenticate the SuperAdmin and redirect them to the SuperAdmin Panel.
6. WHEN a login attempt is made with invalid credentials, THEN THE Authentication_System SHALL reject the attempt and return a descriptive error message.
7. WHEN an authenticated User requests a password change with a valid current password and a new password, THE Authentication_System SHALL update the User's password.
8. IF a new password does not meet the minimum length of 8 characters, THEN THE Authentication_System SHALL reject the change and return a descriptive error message.
9. THE Authentication_System SHALL enforce role-based access control so that a User cannot access Admin or SuperAdmin routes, and an Admin cannot access SuperAdmin routes.

---

### Requirement 2: Referral Link System

**User Story:** As an Admin, I want a unique referral link, so that users who register through it are automatically placed under my account.

#### Acceptance Criteria

1. WHEN a new Admin account is created, THE Platform SHALL generate a unique Referral_Link for that Admin.
2. THE Platform SHALL ensure that each Referral_Link maps to exactly one Admin.
3. WHEN a User registers using an Admin's Referral_Link, THE Platform SHALL permanently associate that User with that Admin.
4. THE Admin_Panel SHALL display the Admin's Referral_Link so the Admin can share it.

---

### Requirement 3: Market Management

**User Story:** As a SuperAdmin, I want to configure game markets with open and close times, so that bets are accepted only during valid windows.

#### Acceptance Criteria

1. THE SuperAdmin_Panel SHALL allow the SuperAdmin to create, edit, and deactivate Markets.
2. WHEN creating or editing a Market, THE SuperAdmin_Panel SHALL require a market name, open time, close time, and result declaration time.
3. WHILE a Market's current time is between its open time and its Lockout_Time, THE Platform SHALL accept new Bets for that Market.
4. WHEN the current time reaches a Market's Lockout_Time, THE Platform SHALL automatically lock that Market and reject any further Bet submissions for that result cycle.
5. WHILE a Market is locked, THE Platform SHALL display the locked status to Users attempting to place Bets.
6. THE Platform SHALL support the following standard Markets: Kalyan, Milan Day, Milan Night, Rajdhani Day, Rajdhani Night, Main Bazar, Time Bazar, Supreme Day, Supreme Night, Madhur Day, Madhur Night.

---

### Requirement 4: Bet Placement

**User Story:** As a User, I want to browse open markets and place bets using my wallet balance, so that I can participate in Matka games.

#### Acceptance Criteria

1. WHEN a User views the game lobby, THE User_Panel SHALL display all active Markets with their open/close times and current status (open, locked, closed).
2. WHEN a User selects an open Market, THE User_Panel SHALL present all seven Bet_Types: Single, Jodi, Single Panna, Double Panna, Triple Panna, Half Sangam, Full Sangam.
3. WHEN a User submits a Bet with a points amount below the Admin-configured minimum, THEN THE Bet_System SHALL reject the Bet and return a descriptive error message.
4. WHEN a User submits a Bet with a points amount above the Admin-configured maximum, THEN THE Bet_System SHALL reject the Bet and return a descriptive error message.
5. WHEN a User submits a valid Bet and their Wallet balance is sufficient, THE Bet_System SHALL deduct the bet points from the User's Wallet and record the Bet.
6. IF a User submits a Bet and their Wallet balance is insufficient, THEN THE Bet_System SHALL reject the Bet and return a descriptive error message.
7. WHEN a User submits a Bet on a locked or closed Market, THEN THE Bet_System SHALL reject the Bet and return a descriptive error message.
8. THE User_Panel SHALL display the User's current Wallet balance at all times while authenticated.

---

### Requirement 5: Bet History and Results View

**User Story:** As a User, I want to view my bet history and results, so that I can track my activity and winnings.

#### Acceptance Criteria

1. THE User_Panel SHALL display a chronological list of all Bets placed by the authenticated User, including market name, Bet_Type, points wagered, result, and outcome (win/loss/pending).
2. WHEN a Result is declared for a Market, THE User_Panel SHALL update the outcome of all affected Bets from "pending" to "win" or "loss".
3. THE User_Panel SHALL display the User's Transaction history, including deposits, withdrawals, bet deductions, and winning credits.

---

### Requirement 6: Result Fetching and Winning Calculation

**User Story:** As a SuperAdmin, I want results to be fetched automatically from an API and winnings credited instantly, so that the platform operates without manual intervention.

#### Acceptance Criteria

1. THE Result_System SHALL periodically poll the Result_API to fetch declared results for each Market.
2. WHEN the Result_API returns a result for a Market, THE Result_System SHALL store the result and trigger winning calculation for all Bets on that Market for the current cycle.
3. WHEN winning calculation is triggered, THE Result_System SHALL identify all winning Bets by matching the declared result against each Bet's selection and Bet_Type rules.
4. WHEN a Bet is identified as a winner, THE Result_System SHALL credit the User's Wallet with the winning amount calculated as: bet points × Winning_Multiplier for that Bet_Type.
5. THE Result_System SHALL process each Bet exactly once per result cycle to prevent duplicate credits.
6. IF the Result_API is unavailable, THEN THE Result_System SHALL log the failure and retry at the next polling interval.
7. WHERE manual result entry is enabled, THE SuperAdmin_Panel SHALL allow the SuperAdmin to manually enter a result for a Market, which triggers the same winning calculation process.

---

### Requirement 7: Wallet and Payment System

**User Story:** As a User, I want to deposit and withdraw funds via UPI, so that I can fund my wallet and cash out winnings.

#### Acceptance Criteria

1. WHEN a User submits a deposit request with a valid UPI transaction reference and amount, THE Payment_System SHALL create a pending deposit Transaction.
2. WHEN an Admin approves a pending deposit Transaction for a User under their management, THE Payment_System SHALL credit the specified Points to the User's Wallet.
3. WHEN a User submits a withdrawal request for an amount not exceeding their current Wallet balance, THE Payment_System SHALL create a pending withdrawal Transaction and place a hold on the requested Points.
4. IF a User submits a withdrawal request for an amount exceeding their current Wallet balance, THEN THE Payment_System SHALL reject the request and return a descriptive error message.
5. WHEN an Admin approves a pending withdrawal Transaction, THE Payment_System SHALL deduct the held Points from the User's Wallet and mark the Transaction as completed.
6. WHEN an Admin rejects a pending withdrawal Transaction, THE Payment_System SHALL release the held Points back to the User's Wallet.
7. THE Payment_System SHALL record every Wallet change as an immutable Transaction entry with a timestamp, type, amount, and resulting balance.

---

### Requirement 8: Admin Panel — User and Bet Management

**User Story:** As an Admin, I want to see all users under me and their real-time bet activity, so that I can monitor game operations and manage requests.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a chronological list of all Users registered under the authenticated Admin.
2. THE Admin_Panel SHALL display all pending deposit and withdrawal Transactions for Users under the authenticated Admin.
3. WHEN an Admin approves or rejects a Transaction, THE Admin_Panel SHALL update the Transaction status in real time.
4. WHILE a Market is within 20 minutes of its result declaration time, THE Admin_Panel SHALL display a live-updating list of all Bets placed on that Market, including the User identifier, Bet_Type, and points wagered.
5. WHILE a Market is within 20 minutes of its result declaration time, THE Admin_Panel SHALL display a running total of all points wagered per Bet_Type for that Market, updating in real time.
6. THE Admin_Panel SHALL allow the Admin to configure minimum and maximum bet points for Users under their management.
7. THE Admin_Panel SHALL allow the Admin to view the profile and account details of any User under their management.

---

### Requirement 9: SuperAdmin Panel — Platform Control

**User Story:** As a SuperAdmin, I want full visibility and control over the entire platform, so that I can manage operations, finances, and configuration.

#### Acceptance Criteria

1. THE SuperAdmin_Panel SHALL allow the SuperAdmin to create, edit, deactivate, and delete Admin accounts.
2. THE SuperAdmin_Panel SHALL display global analytics including: total registered Users, total Points deposited, total Points withdrawn, and platform revenue (total bets placed minus total winnings paid).
3. THE SuperAdmin_Panel SHALL display all data across all Admins and Users.
4. THE SuperAdmin_Panel SHALL allow the SuperAdmin to configure Winning_Multipliers for each Bet_Type.
5. THE SuperAdmin_Panel SHALL allow the SuperAdmin to configure UPI payment details used for deposits.
6. THE SuperAdmin_Panel SHALL allow the SuperAdmin to enable or disable individual Markets and platform-wide features via feature toggles.
7. THE SuperAdmin_Panel SHALL allow the SuperAdmin to configure the Result_API endpoint and polling interval.

---

### Requirement 10: Real-Time Updates

**User Story:** As an Admin, I want the bet dashboard to update in real time before the cutoff, so that I have accurate live data without manually refreshing.

#### Acceptance Criteria

1. WHILE a Market is within 20 minutes of its result declaration time, THE Realtime_System SHALL push bet updates to all authenticated Admins managing that Market without requiring a page refresh.
2. WHEN a new Bet is placed on a Market that is in the pre-result window, THE Realtime_System SHALL broadcast the updated bet list and running totals to all connected Admins within 3 seconds.
3. WHEN a Market reaches its Lockout_Time, THE Realtime_System SHALL push a lock notification to all connected Admins and Users viewing that Market.

---

### Requirement 11: Mobile-First Responsive UI

**User Story:** As a User or Admin, I want the platform to look and feel like a mobile app, so that I can use it comfortably on any device.

#### Acceptance Criteria

1. THE Platform SHALL render all panels (User, Admin, SuperAdmin) with a responsive layout that adapts to screen widths from 320px to 1920px.
2. THE User_Panel SHALL present a mobile-first interface with touch-friendly controls, minimum tap target size of 44×44 pixels, and bottom navigation for primary actions.
3. THE Platform SHALL load the initial view within 3 seconds on a standard 4G mobile connection.
4. THE Platform SHALL support role-based login redirect so that after authentication each Role is sent directly to their respective panel without additional navigation steps.

---

### Requirement 12: Bet and Result Data Integrity

**User Story:** As a SuperAdmin, I want all bets and results to be recorded accurately and immutably, so that disputes can be resolved with a reliable audit trail.

#### Acceptance Criteria

1. THE Platform SHALL assign a unique identifier to every Bet at the time of placement.
2. THE Platform SHALL record the timestamp, User identifier, Market, Bet_Type, selection, and points for every Bet at the time of placement, and this record SHALL NOT be modified after creation.
3. THE Platform SHALL record the declared result and timestamp for every Market result cycle.
4. THE Result_System SHALL ensure that winning calculation for a given Market result cycle is idempotent: running the calculation multiple times for the same result SHALL produce the same Wallet credits without duplication.
5. FOR ALL valid Bets, the sum of all Wallet deductions for bet placements plus the sum of all Wallet credits for winnings SHALL equal the net change in the User's Wallet balance for that period.
