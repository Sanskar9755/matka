/**
 * Authentication service.
 *
 * Handles user registration, login, token refresh, and password changes.
 * Supports three roles: User, Admin, and SuperAdmin (stored in Admin table
 * with referral_code = 'SUPERADMIN' or username = 'superadmin').
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';
import redis from '../../lib/redis.js';
import { AppError } from '../../middleware/errorHandler.js';
import { Role } from '@matka/types';
import type { JwtPayload } from '@matka/types';

const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the role for an Admin record.
 * SuperAdmin is identified by username === 'superadmin' OR referral_code === 'SUPERADMIN'.
 */
function getAdminRole(admin: { username: string; referral_code: string }): Role.Admin | Role.SuperAdmin {
  if (admin.username === 'superadmin' || admin.referral_code === 'SUPERADMIN') {
    return Role.SuperAdmin;
  }
  return Role.Admin;
}

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

function getAccessExpiry(): string {
  return process.env['JWT_ACCESS_EXPIRY'] ?? '15m';
}

function getRefreshExpiry(): string {
  return process.env['JWT_REFRESH_EXPIRY'] ?? '7d';
}

function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: getAccessExpiry() } as jwt.SignOptions);
}

function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: getRefreshExpiry() } as jwt.SignOptions);
}

async function storeRefreshToken(userId: string, token: string): Promise<void> {
  // Store refresh token in Redis with 7-day TTL (in seconds)
  const ttlSeconds = 7 * 24 * 60 * 60;
  await redis.set(`refresh:${userId}`, token, 'EX', ttlSeconds);
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

export interface RegisterResult {
  user: {
    id: string;
    username: string;
    role: Role;
    admin_id: string;
    is_active: boolean;
    created_at: Date;
  };
  accessToken: string;
  refreshToken: string;
}

/**
 * Register a new user with a referral code.
 *
 * - Validates the referral code belongs to an active Admin
 * - Ensures username is unique
 * - Hashes password with bcrypt (12 rounds)
 * - Creates User + Wallet in a single transaction
 * - Sets user.admin_id permanently
 */
export async function register(
  username: string,
  password: string,
  referralCode: string,
): Promise<RegisterResult> {
  // 1. Find admin by referral code (must be active)
  const admin = await prisma.admin.findFirst({
    where: { referral_code: referralCode, is_active: true },
  });

  if (!admin) {
    throw new AppError('INVALID_REFERRAL');
  }

  // 2. Check username uniqueness across both User and Admin tables
  const [existingUser, existingAdmin] = await Promise.all([
    prisma.user.findUnique({ where: { username } }),
    prisma.admin.findUnique({ where: { username } }),
  ]);

  if (existingUser || existingAdmin) {
    throw new AppError('USERNAME_TAKEN');
  }

  // 3. Hash password
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // 4. Create User + Wallet in a single transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        username,
        password_hash,
        role: 'user',
        admin_id: admin.id,
        is_active: true,
      },
    });

    await tx.wallet.create({
      data: {
        user_id: newUser.id,
        balance_points: BigInt(0),
        held_points: BigInt(0),
      },
    });

    return newUser;
  });

  // 5. Issue tokens
  const payload: JwtPayload = {
    userId: user.id,
    role: Role.User,
    adminId: user.admin_id,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await storeRefreshToken(user.id, refreshToken);

  return {
    user: {
      id: user.id,
      username: user.username,
      role: Role.User,
      admin_id: user.admin_id,
      is_active: user.is_active,
      created_at: user.created_at,
    },
    accessToken,
    refreshToken,
  };
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

export interface LoginResult {
  user: {
    id: string;
    username: string;
    role: Role;
    is_active: boolean;
    created_at: Date;
    admin_id?: string;
  };
  accessToken: string;
  refreshToken: string;
  role: Role;
}

/**
 * Login for User, Admin, or SuperAdmin.
 *
 * Searches both User and Admin tables. Issues JWT access + refresh tokens.
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  // Search User table first, then Admin table
  const user = await prisma.user.findUnique({ where: { username } });
  const admin = user ? null : await prisma.admin.findUnique({ where: { username } });

  if (!user && !admin) {
    throw new AppError('INVALID_CREDENTIALS');
  }

  const account = user ?? admin!;

  // Verify password
  const passwordMatch = await bcrypt.compare(password, account.password_hash);
  if (!passwordMatch) {
    throw new AppError('INVALID_CREDENTIALS');
  }

  // Check active status
  if (!account.is_active) {
    throw new AppError('FORBIDDEN');
  }

  let role: Role;
  let payload: JwtPayload;

  if (user) {
    role = Role.User;
    payload = { userId: user.id, role, adminId: user.admin_id };
  } else {
    role = getAdminRole(admin!);
    payload = { userId: admin!.id, role };
  }

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await storeRefreshToken(account.id, refreshToken);

  return {
    user: {
      id: account.id,
      username: account.username,
      role,
      is_active: account.is_active,
      created_at: account.created_at,
      ...(user ? { admin_id: user.admin_id } : {}),
    },
    accessToken,
    refreshToken,
    role,
  };
}

// ---------------------------------------------------------------------------
// refreshToken
// ---------------------------------------------------------------------------

export interface RefreshTokenResult {
  accessToken: string;
}

/**
 * Refresh an access token using a valid refresh token.
 *
 * Verifies the JWT, checks Redis for the stored token, and issues a new access token.
 */
export async function refreshToken(token: string): Promise<RefreshTokenResult> {
  let decoded: JwtPayload;

  try {
    decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    throw new AppError('UNAUTHORIZED');
  }

  // Check Redis for the stored refresh token
  const storedToken = await redis.get(`refresh:${decoded.userId}`);
  if (!storedToken || storedToken !== token) {
    throw new AppError('UNAUTHORIZED');
  }

  // Issue new access token
  const payload: JwtPayload = {
    userId: decoded.userId,
    role: decoded.role,
    ...(decoded.adminId ? { adminId: decoded.adminId } : {}),
  };

  const accessToken = signAccessToken(payload);

  return { accessToken };
}

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------

export interface ChangePasswordResult {
  success: true;
}

/**
 * Change a user's password.
 *
 * Verifies the current password, enforces 8-char minimum, and updates the hash.
 * Works for both User and Admin accounts.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  // Try User table first, then Admin table
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const admin = user ? null : await prisma.admin.findUnique({ where: { id: userId } });

  const account = user ?? admin;
  if (!account) {
    throw new AppError('INVALID_CREDENTIALS');
  }

  // Verify current password
  const passwordMatch = await bcrypt.compare(currentPassword, account.password_hash);
  if (!passwordMatch) {
    throw new AppError('INVALID_CREDENTIALS');
  }

  // Enforce minimum password length
  if (newPassword.length < 8) {
    throw new AppError('PASSWORD_TOO_SHORT');
  }

  // Hash and update
  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  if (user) {
    await prisma.user.update({
      where: { id: userId },
      data: { password_hash: newHash },
    });
  } else {
    await prisma.admin.update({
      where: { id: userId },
      data: { password_hash: newHash },
    });
  }

  return { success: true };
}
