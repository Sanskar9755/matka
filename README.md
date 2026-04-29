# Matka Game Platform

A full-stack web-based Matka/Number game platform with 3 panels — SuperAdmin, Admin, and User.

## Tech Stack

- **Backend:** Node.js 20, TypeScript, Express, Prisma, PostgreSQL, Redis, BullMQ, Socket.IO
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS

---

## Prerequisites

Install these before running:

1. **Node.js 20+** → https://nodejs.org
2. **PostgreSQL 16+** → https://www.postgresql.org/download/windows/
   - Install with password: `postgres`, port: `5432`
3. **Redis (Windows)** → Download portable zip:
   - https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip
   - Extract to `C:\redis5\`

---

## Setup & Run

### Step 1 — Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/matka-game-platform.git
cd matka-game-platform
```

### Step 2 — Install dependencies

```bash
npm install
cd packages/backend && npm install
cd ../frontend && npm install
cd ../..
```

### Step 3 — Create PostgreSQL database

Open pgAdmin or run in terminal:
```bash
# Windows PowerShell
$env:PGPASSWORD = "postgres"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE matka_db;"
```

### Step 4 — Create .env file

Create file: `packages/backend/.env`

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/matka_db"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="matka-platform-super-secret-jwt-key-2026"
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
PORT=3000
NODE_ENV="development"
```

### Step 5 — Run database migrations & seed

```bash
cd packages/backend
npx prisma generate
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
cd ../..
```

### Step 6 — Start Redis

```bash
# Open a new terminal and run:
C:\redis5\redis-server.exe
```

### Step 7 — Start Backend

```bash
# New terminal:
cd packages/backend
npm run dev
```

### Step 8 — Start Frontend

```bash
# New terminal:
cd packages/frontend
npm run dev
```

### Step 9 — Open in browser

```
http://localhost:5173
```

---

## Default Login Credentials

| Role | Username | Password |
|------|----------|----------|
| SuperAdmin | `superadmin` | `SuperAdmin@123` |

---

## How to Use

### 1. SuperAdmin Panel
- Login with `superadmin` / `SuperAdmin@123`
- Go to **Admins** → Create a new Admin (e.g. username: `vishal`, password: `vishal123`)
- Note the **Referral Code** shown under the admin

### 2. Admin Panel
- Login with the admin credentials you just created
- Go to **Settings** to see your referral link
- Share the referral code with users

### 3. User Registration
- Go to: `http://localhost:5173/register`
- Enter username, password (min 8 chars), and the admin's referral code
- You'll be logged in automatically

### 4. Add Wallet Balance (Admin)
- Login as Admin
- Go to **Transactions** → Approve user deposit requests
- Or directly via database (for testing)

### 5. Place Bets (User)
- Login as User
- Go to **Markets** → Select an open market
- Choose bet type (Single, Jodi, SP, DP, TP, Half Sangam, Full Sangam)
- Enter selection and points → Place Bet

---

## Project Structure

```
matka-game-platform/
├── packages/
│   ├── backend/          # Express API server
│   │   ├── src/
│   │   │   ├── api/      # Route handlers (auth, markets, bets, wallet, admin, superadmin)
│   │   │   ├── workers/  # BullMQ workers (result poller, winning calc, market lockout)
│   │   │   ├── realtime/ # Socket.IO + Redis Pub/Sub
│   │   │   ├── lib/      # Prisma, Redis, BullMQ singletons
│   │   │   └── middleware/
│   │   └── prisma/       # Schema + migrations + seed
│   └── frontend/         # React SPA
│       └── src/
│           ├── pages/    # SuperAdmin, Admin, User panels
│           ├── components/
│           └── context/
└── README.md
```

---

## Features

- ✅ 3-panel role-based system (SuperAdmin / Admin / User)
- ✅ Multiple Admins with isolated user pools
- ✅ Referral link system for user registration
- ✅ 11 standard Matka markets (Kalyan, Milan Day/Night, Rajdhani, etc.)
- ✅ 7 bet types (Single, Jodi, SP, DP, TP, Half Sangam, Full Sangam)
- ✅ UPI deposit/withdrawal with Admin approval
- ✅ Automatic result fetching via API
- ✅ Automatic winning calculation
- ✅ Market auto-lock 20 minutes before result
- ✅ Real-time Admin dashboard (Socket.IO)
- ✅ Mobile-first responsive UI
