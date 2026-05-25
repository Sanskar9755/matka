# HTTPS/SSL Production Fix — Bugfix Design

## Overview

The Matka game platform is running in production over plain HTTP with no TLS termination, no
reverse proxy, and no process manager. This design formalises the bug condition, defines the
expected correct behaviour, hypothesises root causes, and specifies the exact changes required
to make the platform production-ready:

- **nginx** as the HTTPS reverse proxy (port 443 with Let's Encrypt TLS, HTTP→HTTPS redirect)
- **Certbot** for automated certificate issuance and renewal
- **nginx** proxying `/api` and `/socket.io` to `localhost:3000` with WebSocket upgrade support
- **nginx** serving the Vite production build as static files
- **PM2** as the Node.js process manager for automatic restarts and boot persistence
- **CORS** restricted to the production domain
- **Environment variable** additions for `FRONTEND_URL` and `NODE_ENV=production`

The fix is purely infrastructure and configuration — no application logic changes are required
except for the CORS origin restriction in `app.ts` and `socketServer.ts`.

---

## Glossary

- **Bug_Condition (C)**: The set of runtime conditions under which the platform is inaccessible
  or insecure — specifically: no TLS certificate, no reverse proxy, no process manager, and
  wildcard CORS.
- **Property (P)**: The desired observable behaviour when the fix is applied — HTTPS padlock,
  working API and WebSocket over `wss://`, automatic process restart, and restricted CORS.
- **Preservation**: All existing application behaviour (JWT auth, Socket.IO rooms, database
  queries, local development workflow) that must remain unchanged after the fix.
- **nginx**: The reverse proxy and static file server placed in front of the Express backend.
- **Certbot**: The Let's Encrypt ACME client that issues and auto-renews TLS certificates.
- **PM2**: Node.js process manager that keeps the backend running and restarts it on crash or
  reboot.
- **`app.ts`**: `packages/backend/src/app.ts` — Express application entry point where CORS is
  configured.
- **`socketServer.ts`**: `packages/backend/src/realtime/socketServer.ts` — Socket.IO server
  where WebSocket CORS is configured.
- **`vite.config.ts`**: `packages/frontend/vite.config.ts` — Vite configuration; the dev-server
  proxy defined here does NOT exist in production builds.
- **`FRONTEND_URL`**: New environment variable holding the production domain
  (e.g. `https://matka.example.com`) used to restrict CORS.

---

## Bug Details

### Bug Condition

The bug manifests across three independent failure modes that together make the production
deployment insecure and unreliable:

1. The Express server listens on HTTP port 3000 with no TLS layer in front of it.
2. The Vite dev-server proxy (`/api`, `/socket.io` → `localhost:3000`) is absent in production
   builds, so API calls resolve to the same HTTP origin and WebSocket connections fail.
3. The Node.js process has no supervisor, so any crash or server reboot causes permanent
   downtime until someone manually restarts it.

**Formal Specification:**

```
FUNCTION isBugCondition(deploymentState)
  INPUT: deploymentState — snapshot of the server configuration at runtime
  OUTPUT: boolean

  RETURN (
    deploymentState.nginxInstalled = false
    OR deploymentState.tlsCertificateValid = false
    OR deploymentState.port443Listening = false
  )
  OR (
    deploymentState.productionBuild = true
    AND deploymentState.apiBaseUrl RESOLVES_TO http://
  )
  OR (
    deploymentState.processManagerRunning = false
  )
  OR (
    deploymentState.corsOrigin = '*'
    AND deploymentState.nodeEnv = 'production'
  )
END FUNCTION
```

### Examples

- **Example 1 — No HTTPS**: User visits `http://matka.example.com`. Browser shows "Not Secure"
  warning. Expected: browser shows padlock, URL auto-upgrades to `https://`.
- **Example 2 — API calls fail in production**: Frontend production build calls `GET /api/markets`.
  Request goes to `http://matka.example.com/api/markets` (HTTP). Expected: request goes to
  `https://matka.example.com/api/markets` and nginx proxies it to `localhost:3000`.
- **Example 3 — WebSocket fails**: Socket.IO client attempts `wss://matka.example.com/socket.io`.
  Connection is refused because no nginx WebSocket proxy exists. Expected: nginx upgrades the
  connection and proxies it to `localhost:3000`.
- **Example 4 — Process crash causes downtime**: Backend throws an unhandled exception and exits.
  Site is down until manual restart. Expected: PM2 detects the exit and restarts within seconds.
- **Example 5 — CORS wildcard blocks credentialed requests**: Browser sends a credentialed
  `fetch` with `credentials: 'include'`. Server responds with `Access-Control-Allow-Origin: *`,
  which browsers reject for credentialed requests. Expected: header returns the specific
  production origin.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Local development with `npm run dev` (Vite dev-server proxy on port 5173) must continue to
  work without nginx or SSL.
- JWT authentication middleware must continue to validate tokens and return correct responses.
- Socket.IO rooms (`market:*`, `admin:*`, `results:new`) must continue to broadcast events in
  real time.
- The backend must continue to listen on the port defined by the `PORT` environment variable
  (default `3000`).
- Database (PostgreSQL) and Redis connections must continue to function with no changes to
  connection strings.
- All existing API routes (`/api/auth`, `/api/markets`, `/api/bets`, etc.) must continue to
  respond correctly.
- The frontend Vite build output in `packages/frontend/dist/` must continue to be generated by
  `npm run build` without modification.

**Scope:**

All inputs that do NOT involve the production deployment configuration (nginx, TLS, PM2, CORS
origin) are completely unaffected by this fix. This includes:

- Local development HTTP traffic on `localhost:5173` and `localhost:3000`
- Application business logic (bet matching, market lockout, result polling)
- Database schema and migrations
- JWT token generation and validation
- Redis Pub/Sub channels

---

## Hypothesized Root Cause

Based on the bug description and code review, the root causes are confirmed (not merely
hypothesised) because the absence of configuration files is directly observable:

1. **No nginx installation or configuration**: There is no `/etc/nginx/sites-available/matka`
   config file. The Express server is exposed directly on port 3000 over HTTP. No TLS
   termination exists anywhere in the stack.

2. **No TLS certificate**: Certbot has not been run. No certificate exists at
   `/etc/letsencrypt/live/<domain>/`. Without a certificate, port 443 cannot be opened.

3. **Vite proxy is dev-only**: `vite.config.ts` defines `/api` and `/socket.io` proxies under
   the `server.proxy` key, which Vite only activates during `vite dev`. The production build
   (`vite build`) outputs static HTML/JS/CSS with no proxy — API calls resolve relative to the
   page origin, which is HTTP.

4. **No process manager**: There is no `ecosystem.config.js` (PM2), no systemd unit file, and
   no `forever` or similar tool. The backend is started manually with `node dist/app.js` or
   `npm run dev`, meaning any crash or reboot causes permanent downtime.

5. **Wildcard CORS**: `app.ts` calls `app.use(cors())` with no options, which defaults to
   `origin: '*'`. `socketServer.ts` also sets `origin: '*'`. This is incompatible with
   credentialed requests and does not restrict access to the production domain.

---

## Correctness Properties

Property 1: Bug Condition — HTTPS and Proxy Availability

_For any_ HTTP or HTTPS request to the production domain where the bug condition holds
(no nginx, no TLS, or no process manager), the fixed deployment SHALL serve all traffic over
HTTPS with a valid TLS certificate, proxy `/api` and `/socket.io` requests to the Express
backend on `localhost:3000`, and keep the backend process running continuously via PM2.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation — Local Development and Application Behaviour

_For any_ input where the bug condition does NOT hold (local development environment, or
application-level requests after the fix is applied), the fixed configuration SHALL produce
exactly the same behaviour as before the fix — local dev proxy works unchanged, JWT auth
returns correct responses, Socket.IO rooms broadcast correctly, and all API routes respond
identically.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

---

## Fix Implementation

### Changes Required

#### 1. Install nginx and Certbot (server-level)

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

#### 2. Obtain TLS Certificate

```bash
sudo certbot --nginx -d matka.example.com
```

Certbot will automatically edit the nginx config to add TLS directives and schedule a
systemd timer for auto-renewal.

#### 3. nginx Site Configuration

**File**: `/etc/nginx/sites-available/matka`

```nginx
# Redirect all HTTP traffic to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name matka.example.com;

    # Allow Certbot ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name matka.example.com;

    # TLS certificates (managed by Certbot)
    ssl_certificate     /etc/letsencrypt/live/matka.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/matka.example.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    # Serve Vite production build as static files
    root /var/www/matka/frontend/dist;
    index index.html;

    # SPA fallback — all non-file routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy REST API to Express backend
    location /api {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Proxy Socket.IO with WebSocket upgrade support
    location /socket.io {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/matka /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 4. CORS Fix in `app.ts`

**File**: `packages/backend/src/app.ts`

Replace the wildcard `cors()` call with an origin-restricted configuration:

```typescript
// Before
app.use(cors());

// After
const allowedOrigin = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
}));
```

#### 5. CORS Fix in `socketServer.ts`

**File**: `packages/backend/src/realtime/socketServer.ts`

Replace the wildcard Socket.IO CORS with the same environment-driven origin:

```typescript
// Before
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// After
const allowedOrigin = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
```

#### 6. Environment Variable Updates

**File**: `packages/backend/.env` (production copy on server)

Add the following variables:

```dotenv
NODE_ENV="production"
FRONTEND_URL="https://matka.example.com"
```

**File**: `packages/backend/.env.example` (committed to repo)

```dotenv
# Production domain — used to restrict CORS origin
FRONTEND_URL="https://your-domain.com"
```

#### 7. PM2 Process Manager Setup

Install PM2 globally:

```bash
npm install -g pm2
```

Create PM2 ecosystem file:

**File**: `packages/backend/ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [
    {
      name: 'matka-backend',
      script: 'dist/app.js',
      cwd: '/var/www/matka/packages/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_file: '/var/www/matka/packages/backend/.env',
      error_file: '/var/log/pm2/matka-error.log',
      out_file: '/var/log/pm2/matka-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
```

Start and persist PM2 across reboots:

```bash
cd /var/www/matka/packages/backend
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow the printed command to register the systemd service
```

#### 8. Frontend Build and Deployment

Build the frontend and copy to the nginx web root:

```bash
cd /var/www/matka/packages/frontend
npm run build
sudo mkdir -p /var/www/matka/frontend/dist
sudo cp -r dist/* /var/www/matka/frontend/dist/
```

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that
demonstrate the bug on the unfixed deployment, then verify the fix works correctly and
preserves existing behaviour.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE applying the fix. Confirm
the root cause analysis. If any counterexample is not reproduced, re-examine the hypothesis.

**Test Plan**: Run the following checks against the unfixed production server to observe
failures and confirm root causes.

**Test Cases**:

1. **HTTP Redirect Test**: Visit `http://matka.example.com` in a browser — expect "Not Secure"
   warning and no redirect to HTTPS (will fail on unfixed server, confirming root cause 1 & 2).
2. **API Reachability Test**: `curl https://matka.example.com/api/health` — expect connection
   refused or SSL error (will fail on unfixed server, confirming root cause 1).
3. **WebSocket Connection Test**: Open browser DevTools → Network → WS tab, load the app —
   expect WebSocket connection failure (will fail on unfixed server, confirming root cause 3).
4. **Process Restart Test**: `kill $(lsof -t -i:3000)` on the server — expect site to go down
   permanently (will fail on unfixed server, confirming root cause 4).
5. **CORS Credentialed Request Test**: Send a credentialed `fetch` from the browser — expect
   CORS error in console (will fail on unfixed server, confirming root cause 5).

**Expected Counterexamples**:

- `curl -I https://matka.example.com` returns `curl: (7) Failed to connect` or SSL error
- Browser console shows `WebSocket connection to 'wss://...' failed`
- After killing the process, `curl http://matka.example.com:3000/health` returns `Connection refused`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed deployment
produces the expected behaviour.

**Pseudocode:**

```
FOR ALL request WHERE isBugCondition(deploymentState) DO
  response := sendRequest(request, fixedDeployment)
  ASSERT response.protocol = 'https'
  ASSERT response.status IN [200, 301, 302, 304]
  ASSERT response.headers['strict-transport-security'] EXISTS
END FOR

FOR ALL wsConnection WHERE isBugCondition(deploymentState) DO
  connection := openWebSocket('wss://matka.example.com/socket.io')
  ASSERT connection.state = 'OPEN'
END FOR

FOR ALL processRestart WHERE isBugCondition(deploymentState) DO
  kill(backendProcess)
  wait(5 seconds)
  ASSERT pm2.status('matka-backend') = 'online'
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (local dev, and
application-level requests after fix), the fixed configuration produces the same behaviour
as before.

**Pseudocode:**

```
FOR ALL request WHERE NOT isBugCondition(deploymentState) DO
  ASSERT localDevProxy(request) = fixedDeployment(request)
  ASSERT jwtAuth(request) = jwtAuth_original(request)
  ASSERT socketIoRoom(event) = socketIoRoom_original(event)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behaviour is unchanged for all non-buggy inputs

**Test Plan**: Observe behaviour on the unfixed code first for JWT auth, Socket.IO events, and
API responses, then write property-based tests capturing that behaviour.

**Test Cases**:

1. **JWT Auth Preservation**: Verify that `POST /api/auth/login` returns a valid token before
   and after the fix — behaviour must be identical.
2. **API Route Preservation**: Verify that `GET /api/markets` returns the same market list
   before and after the fix.
3. **Socket.IO Room Preservation**: Verify that `join:market` and `leave:market` events
   continue to work correctly after the fix.
4. **Local Dev Proxy Preservation**: Verify that `npm run dev` on a developer machine still
   proxies `/api` and `/socket.io` to `localhost:3000` without nginx.
5. **CORS Preservation for Dev**: Verify that `FRONTEND_URL=http://localhost:5173` allows
   local dev requests when `NODE_ENV=development`.

### Unit Tests

- Test that `app.ts` CORS middleware uses `FRONTEND_URL` env var when set
- Test that `socketServer.ts` CORS uses `FRONTEND_URL` env var when set
- Test that `FRONTEND_URL` defaults to `http://localhost:5173` when not set
- Test that the health endpoint `/health` continues to return `{ status: 'ok' }`

### Property-Based Tests

- Generate random valid JWT tokens and verify auth middleware accepts them after the CORS
  change (CORS change must not affect auth logic)
- Generate random API request payloads and verify responses are identical before and after
  the CORS origin restriction
- Generate random Socket.IO event sequences and verify room membership is preserved

### Integration Tests

- Full HTTPS request flow: browser → nginx (443) → Express (3000) → database → response
- WebSocket upgrade flow: `wss://` handshake → nginx upgrade headers → Socket.IO connection
- PM2 restart flow: kill process → PM2 restarts → health check passes within 10 seconds
- HTTP→HTTPS redirect: `curl -I http://matka.example.com` returns `301` with `Location: https://`
- SPA routing: `GET /lobby` returns `index.html` (nginx `try_files` fallback)

---

## Step-by-Step Deployment Guide

This guide assumes a fresh Ubuntu 22.04 / Debian 12 VPS with the repo cloned to
`/var/www/matka` and Node.js 20+ installed.

### Step 1 — Install Dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx
npm install -g pm2
```

### Step 2 — Build the Backend

```bash
cd /var/www/matka/packages/backend
npm install
npm run build          # outputs to packages/backend/dist/
```

### Step 3 — Build the Frontend

```bash
cd /var/www/matka/packages/frontend
npm install
npm run build          # outputs to packages/frontend/dist/
```

### Step 4 — Configure Environment Variables

```bash
cp /var/www/matka/packages/backend/.env.example /var/www/matka/packages/backend/.env
# Edit .env and set:
#   NODE_ENV=production
#   FRONTEND_URL=https://matka.example.com
#   DATABASE_URL=postgresql://...
#   REDIS_URL=redis://...
#   JWT_SECRET=<strong-random-secret>
```

### Step 5 — Apply CORS Code Changes

Apply the changes to `app.ts` and `socketServer.ts` described in Fix Implementation
sections 4 and 5, then rebuild the backend:

```bash
cd /var/www/matka/packages/backend
npm run build
```

### Step 6 — Configure nginx

```bash
sudo nano /etc/nginx/sites-available/matka
# Paste the nginx config from Fix Implementation section 3
# Replace matka.example.com with your actual domain

sudo ln -s /etc/nginx/sites-available/matka /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # remove default site if present
sudo nginx -t                                  # verify config syntax
sudo systemctl reload nginx
```

### Step 7 — Obtain TLS Certificate

```bash
sudo certbot --nginx -d matka.example.com
# Follow prompts; Certbot will update the nginx config automatically
sudo systemctl reload nginx
```

Verify auto-renewal:

```bash
sudo certbot renew --dry-run
```

### Step 8 — Deploy Frontend Static Files

```bash
sudo mkdir -p /var/www/matka/frontend/dist
sudo cp -r /var/www/matka/packages/frontend/dist/* /var/www/matka/frontend/dist/
sudo chown -R www-data:www-data /var/www/matka/frontend/dist
```

### Step 9 — Start Backend with PM2

```bash
cd /var/www/matka/packages/backend
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # copy and run the printed sudo command
```

Verify:

```bash
pm2 status
pm2 logs matka-backend --lines 50
```

### Step 10 — Smoke Test

```bash
# HTTPS redirect
curl -I http://matka.example.com
# Expected: HTTP/1.1 301 Moved Permanently, Location: https://matka.example.com/

# HTTPS health check
curl https://matka.example.com/health
# Expected: {"status":"ok","timestamp":"..."}

# API proxy
curl https://matka.example.com/api/markets
# Expected: JSON response (may require auth token)

# WebSocket (requires wscat: npm install -g wscat)
wscat -c wss://matka.example.com/socket.io/?EIO=4&transport=websocket
# Expected: connection established
```

### Step 11 — Verify PM2 Auto-Restart

```bash
pm2 kill   # stop PM2 daemon
pm2 resurrect   # should restore matka-backend from saved state
pm2 status
```

### Ongoing Maintenance

- **Certificate renewal**: Certbot systemd timer runs twice daily automatically.
  Check with `systemctl status certbot.timer`.
- **Backend updates**: `npm run build` in `packages/backend`, then `pm2 restart matka-backend`.
- **Frontend updates**: `npm run build` in `packages/frontend`, then
  `sudo cp -r dist/* /var/www/matka/frontend/dist/`.
- **Logs**: `pm2 logs matka-backend`, `sudo tail -f /var/log/nginx/error.log`.
