/**
 * Prisma client singleton.
 *
 * Reuses a single PrismaClient instance across the application to avoid
 * exhausting the database connection pool. In development, the instance is
 * stored on the global object so that hot-module reloads (tsx watch) do not
 * create a new client on every file change.
 */

import { PrismaClient } from '@prisma/client';

// Extend the global type so TypeScript knows about our cached instance.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
  });
}

const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.__prisma = prisma;
}

export default prisma;
