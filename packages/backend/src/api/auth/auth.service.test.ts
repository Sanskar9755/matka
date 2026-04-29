/**
 * Unit tests for the auth service.
 *
 * Prisma and Redis are mocked so no real database or cache is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
vi.mock('../../lib/prisma.js', () => {
  const mockPrisma = {
    admin: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { default: mockPrisma };
});

// ---------------------------------------------------------------------------
// Mock Redis
// ---------------------------------------------------------------------------
vi.mock('../../lib/redis.js', () => {
  const mockRedis = {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
  };
  return { default: mockRedis };
});

// ---------------------------------------------------------------------------
// Mock bcrypt (speed up tests — no real hashing needed)
// ---------------------------------------------------------------------------
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$hashed$'),
    compare: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock jsonwebtoken
// ---------------------------------------------------------------------------
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock.jwt.token'),
    verify: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------
import prisma from '../../lib/prisma.js';
import bcrypt from 'bcrypt';
import { register, login, changePassword } from './auth.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAdmin = {
  id: 'admin-uuid-1',
  username: 'admin1',
  password_hash: '$hashed$',
  referral_code: 'REF123',
  is_active: true,
  min_bet_points: 10,
  max_bet_points: 10000,
  created_at: new Date(),
};

const mockUser = {
  id: 'user-uuid-1',
  username: 'testuser',
  password_hash: '$hashed$',
  role: 'user' as const,
  admin_id: 'admin-uuid-1',
  is_active: true,
  created_at: new Date(),
};

// ---------------------------------------------------------------------------
// register tests
// ---------------------------------------------------------------------------

describe('register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['JWT_SECRET'] = 'test-secret-at-least-16-chars';
    process.env['JWT_ACCESS_EXPIRY'] = '15m';
    process.env['JWT_REFRESH_EXPIRY'] = '7d';
  });

  it('throws INVALID_REFERRAL when referral code does not exist', async () => {
    vi.mocked(prisma.admin.findFirst).mockResolvedValue(null);

    await expect(register('newuser', 'password123', 'BADCODE')).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_REFERRAL' }),
    );
  });

  it('throws INVALID_REFERRAL when admin is inactive', async () => {
    vi.mocked(prisma.admin.findFirst).mockResolvedValue(null); // is_active filter returns null

    await expect(register('newuser', 'password123', 'INACTIVE')).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_REFERRAL' }),
    );
  });

  it('throws USERNAME_TAKEN when username already exists in User table', async () => {
    vi.mocked(prisma.admin.findFirst).mockResolvedValue(mockAdmin);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.admin.findUnique).mockResolvedValue(null);

    await expect(register('testuser', 'password123', 'REF123')).rejects.toThrow(
      expect.objectContaining({ code: 'USERNAME_TAKEN' }),
    );
  });

  it('throws USERNAME_TAKEN when username already exists in Admin table', async () => {
    vi.mocked(prisma.admin.findFirst).mockResolvedValue(mockAdmin);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.admin.findUnique).mockResolvedValue(mockAdmin);

    await expect(register('admin1', 'password123', 'REF123')).rejects.toThrow(
      expect.objectContaining({ code: 'USERNAME_TAKEN' }),
    );
  });

  it('creates user and wallet in a transaction on valid input', async () => {
    vi.mocked(prisma.admin.findFirst).mockResolvedValue(mockAdmin);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.admin.findUnique).mockResolvedValue(null);

    // Simulate $transaction calling the callback
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        user: { create: vi.fn().mockResolvedValue(mockUser) },
        wallet: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    const result = await register('newuser', 'password123', 'REF123');

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user.admin_id).toBe(mockAdmin.id);
  });
});

// ---------------------------------------------------------------------------
// login tests
// ---------------------------------------------------------------------------

describe('login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['JWT_SECRET'] = 'test-secret-at-least-16-chars';
  });

  it('throws INVALID_CREDENTIALS when user is not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.admin.findUnique).mockResolvedValue(null);

    await expect(login('nobody', 'password')).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    );
  });

  it('throws INVALID_CREDENTIALS when password is wrong', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(login('testuser', 'wrongpassword')).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    );
  });

  it('throws FORBIDDEN when account is inactive', async () => {
    const inactiveUser = { ...mockUser, is_active: false };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(inactiveUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await expect(login('testuser', 'password123')).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('returns tokens and role on successful login', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await login('testuser', 'password123');

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.role).toBe('user');
  });
});

// ---------------------------------------------------------------------------
// changePassword tests
// ---------------------------------------------------------------------------

describe('changePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws INVALID_CREDENTIALS when user is not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.admin.findUnique).mockResolvedValue(null);

    await expect(changePassword('nonexistent-id', 'current', 'newpassword')).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    );
  });

  it('throws INVALID_CREDENTIALS when current password is wrong', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(changePassword('user-uuid-1', 'wrongcurrent', 'newpassword')).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    );
  });

  it('throws PASSWORD_TOO_SHORT when new password is less than 8 characters', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await expect(changePassword('user-uuid-1', 'current', 'short')).rejects.toThrow(
      expect.objectContaining({ code: 'PASSWORD_TOO_SHORT' }),
    );
  });

  it('throws PASSWORD_TOO_SHORT for exactly 7 characters', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await expect(changePassword('user-uuid-1', 'current', '1234567')).rejects.toThrow(
      expect.objectContaining({ code: 'PASSWORD_TOO_SHORT' }),
    );
  });

  it('succeeds when new password is exactly 8 characters', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, password_hash: '$newhash$' });

    const result = await changePassword('user-uuid-1', 'current', '12345678');
    expect(result).toEqual({ success: true });
  });

  it('succeeds and updates password hash', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, password_hash: '$newhash$' });

    const result = await changePassword('user-uuid-1', 'currentpassword', 'newpassword123');
    expect(result).toEqual({ success: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-uuid-1' },
      data: { password_hash: '$hashed$' }, // bcrypt.hash is mocked to return '$hashed$'
    });
  });
});
