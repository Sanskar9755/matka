# Bugfix Requirements Document

## Introduction

The Matka game platform is deployed on a live production server but is experiencing two critical issues:

1. **No HTTPS / SSL** — The site is served over plain HTTP, causing browsers to display "Not Secure". There is no nginx reverse proxy or SSL termination layer configured. The Express backend listens on port 3000 over HTTP only, and the frontend Vite build uses a relative `/api` base URL that relies on the Vite dev-server proxy — a proxy that does not exist in production builds.

2. **Intermittent accessibility** — The site sometimes opens and sometimes does not. This is consistent with the Node.js process crashing and not being managed by a process manager (e.g. PM2), or with port conflicts, or with the backend not binding to the correct network interface for external access.

The fix requires: configuring nginx as an HTTPS reverse proxy with a TLS certificate (Let's Encrypt / Certbot), ensuring the frontend production build points to the correct API origin, and making the backend process reliably restart on failure.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user visits the production site URL THEN the browser shows "Not Secure" because the site is served over HTTP with no TLS certificate

1.2 WHEN the frontend production build makes API calls THEN the requests use the relative path `/api` which resolves to the same HTTP origin, bypassing any HTTPS upgrade

1.3 WHEN the backend Express server starts THEN it listens only on HTTP port 3000 with no SSL termination layer in front of it

1.4 WHEN the Node.js backend process crashes or the server reboots THEN the site becomes inaccessible because there is no process manager to restart it automatically

1.5 WHEN a browser attempts to connect via WebSocket (Socket.IO) over HTTPS THEN the connection fails because the WebSocket endpoint is not proxied through a secure `wss://` channel

1.6 WHEN the CORS middleware is configured THEN it uses `origin: '*'` (wildcard) which is incompatible with credentialed requests and does not restrict access to the production domain

### Expected Behavior (Correct)

2.1 WHEN a user visits the production site URL THEN the browser SHALL show a padlock and serve the site over HTTPS using a valid TLS certificate

2.2 WHEN the frontend production build makes API calls THEN the requests SHALL be routed through the nginx HTTPS reverse proxy to the backend on port 3000

2.3 WHEN nginx is configured THEN it SHALL terminate TLS on port 443, redirect HTTP port 80 to HTTPS, and proxy `/api` and `/socket.io` traffic to the Express backend on `localhost:3000`

2.4 WHEN the backend process crashes or the server reboots THEN the process manager (PM2) SHALL automatically restart the backend so the site remains accessible

2.5 WHEN a browser connects via WebSocket over HTTPS THEN the connection SHALL succeed over `wss://` because nginx proxies the `/socket.io` path with WebSocket upgrade headers

2.6 WHEN the CORS middleware is configured for production THEN it SHALL restrict the allowed origin to the production domain instead of using a wildcard

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a developer runs the project locally with `npm run dev` THEN the system SHALL CONTINUE TO use the Vite dev-server proxy on `http://localhost:5173` without requiring nginx or SSL

3.2 WHEN authenticated API requests are made THEN the system SHALL CONTINUE TO validate JWT tokens and return the correct responses

3.3 WHEN Socket.IO events are emitted (market lock, bet updates, results) THEN the system SHALL CONTINUE TO broadcast them to the correct rooms in real time

3.4 WHEN the backend starts THEN it SHALL CONTINUE TO listen on the port defined by the `PORT` environment variable (default 3000)

3.5 WHEN the database and Redis connections are established THEN the system SHALL CONTINUE TO function correctly with no changes to connection strings or credentials

3.6 WHEN the frontend is built for production THEN the static assets SHALL CONTINUE TO be served correctly by nginx from the `dist/` output directory
