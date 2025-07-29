import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../authService';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// Mock the database
vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  }
}));

describe('AuthService OAuth Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOAuthUser', () => {
    it('should create user with Google OAuth provider', async () => {
      const mockUser = {
        id: 'test-uuid',
        email: 'test@gmail.com',
        firstName: 'John',
        lastName: 'Doe',
        authProvider: 'google',
        providerId: 'google-123',
        passwordHash: null,
        role: 'user',
        subscriptionTier: 'free',
      };

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockUser])
      };
      (db.insert as any).mockReturnValue(mockInsert);

      const result = await AuthService.createOAuthUser({
        email: 'test@gmail.com',
        firstName: 'John',
        lastName: 'Doe',
        authProvider: 'google',
        providerId: 'google-123'
      });

      expect(db.insert).toHaveBeenCalledWith(users);
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@gmail.com',
          firstName: 'John',
          lastName: 'Doe',
          authProvider: 'google',
          providerId: 'google-123',
          passwordHash: null
        })
      );
      expect(result).toEqual(mockUser);
    });

    it('should create user with Apple OAuth provider without email', async () => {
      const mockUser = {
        id: 'test-uuid',
        email: null,
        firstName: 'Jane',
        lastName: 'Smith',
        authProvider: 'apple',
        providerId: 'apple-456',
        passwordHash: null,
      };

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockUser])
      };
      (db.insert as any).mockReturnValue(mockInsert);

      const result = await AuthService.createOAuthUser({
        firstName: 'Jane',
        lastName: 'Smith',
        authProvider: 'apple',
        providerId: 'apple-456'
      });

      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          email: null,
          authProvider: 'apple',
          providerId: 'apple-456',
          passwordHash: null
        })
      );
    });
  });

  describe('findUserByProvider', () => {
    it('should find user by OAuth provider and provider ID', async () => {
      const mockUser = {
        id: 'test-uuid',
        authProvider: 'google',
        providerId: 'google-123',
        email: 'test@gmail.com'
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockUser])
      };
      (db.select as any).mockReturnValue(mockSelect);

      const result = await AuthService.findUserByProvider('google', 'google-123');

      expect(db.select).toHaveBeenCalled();
      expect(mockSelect.from).toHaveBeenCalledWith(users);
      expect(mockSelect.where).toHaveBeenCalledWith(
        and(
          eq(users.authProvider, 'google'),
          eq(users.providerId, 'google-123')
        )
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([])
      };
      (db.select as any).mockReturnValue(mockSelect);

      const result = await AuthService.findUserByProvider('twitter', 'twitter-789');

      expect(result).toBeNull();
    });
  });

  describe('authenticateOAuthUser', () => {
    it('should authenticate valid OAuth user', async () => {
      const mockUser = {
        id: 'test-uuid',
        authProvider: 'google',
        providerId: 'google-123',
        email: 'test@gmail.com'
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockUser])
      };
      (db.select as any).mockReturnValue(mockSelect);

      const result = await AuthService.authenticateOAuthUser('google', 'google-123');

      expect(result).toEqual(mockUser);
    });
  });

  describe('isProviderAccountExists', () => {
    it('should return true when provider account exists', async () => {
      const mockUser = { id: 'test-uuid' };
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockUser])
      };
      (db.select as any).mockReturnValue(mockSelect);

      const result = await AuthService.isProviderAccountExists('google', 'google-123');

      expect(result).toBe(true);
    });

    it('should return false when provider account does not exist', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([])
      };
      (db.select as any).mockReturnValue(mockSelect);

      const result = await AuthService.isProviderAccountExists('apple', 'apple-nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('authenticateEmailUser with OAuth support', () => {
    it('should only authenticate email provider users', async () => {
      const mockUser = {
        id: 'test-uuid',
        email: 'test@example.com',
        authProvider: 'email',
        passwordHash: '$2a$12$hashedpassword'
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockUser])
      };
      (db.select as any).mockReturnValue(mockSelect);

      // Mock password verification
      vi.spyOn(AuthService, 'verifyPassword').mockResolvedValue(true);

      const result = await AuthService.authenticateEmailUser('test@example.com', 'password123');

      expect(mockSelect.where).toHaveBeenCalledWith(
        and(
          eq(users.email, 'test@example.com'),
          eq(users.authProvider, 'email')
        )
      );
      expect(result).toEqual(mockUser);
    });

    it('should not authenticate OAuth users with email authentication', async () => {
      const mockOAuthUser = {
        id: 'test-uuid',
        email: 'test@gmail.com',
        authProvider: 'google',
        passwordHash: null
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]) // No email provider user found
      };
      (db.select as any).mockReturnValue(mockSelect);

      const result = await AuthService.authenticateEmailUser('test@gmail.com', 'password123');

      expect(result).toBeNull();
    });
  });

  describe('createEmailUser with OAuth support', () => {
    it('should create email user with explicit auth_provider field', async () => {
      const mockUser = {
        id: 'test-uuid',
        email: 'test@example.com',
        authProvider: 'email',
        providerId: null,
        passwordHash: '$2a$12$hashedpassword'
      };

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockUser])
      };
      (db.insert as any).mockReturnValue(mockInsert);

      vi.spyOn(AuthService, 'hashPassword').mockResolvedValue('$2a$12$hashedpassword');

      const result = await AuthService.createEmailUser({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe'
      });

      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          authProvider: 'email',
          providerId: null,
          passwordHash: '$2a$12$hashedpassword'
        })
      );
    });
  });
});