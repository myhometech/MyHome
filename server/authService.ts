import bcrypt from "bcryptjs";
import crypto from "crypto";
import { users, type User, type InsertUser, type AuthProvider, type OAuthRegisterData } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export class AuthService {
  // Hash password for storage
  static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  // Verify password against hash
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Create user with email/password
  static async createEmailUser(userData: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<User> {
    const passwordHash = await this.hashPassword(userData.password);
    const userId = crypto.randomUUID();

    const [user] = await db
      .insert(users)
      .values({
        id: userId,
        email: userData.email.toLowerCase(),
        firstName: userData.firstName,
        lastName: userData.lastName,
        passwordHash,
        authProvider: "email", // Explicitly set for email users
        providerId: null, // No provider ID for email users
      })
      .returning();

    return user;
  }

  // Create user with OAuth provider
  static async createOAuthUser(userData: OAuthRegisterData): Promise<User> {
    const userId = crypto.randomUUID();

    const [user] = await db
      .insert(users)
      .values({
        id: userId,
        email: userData.email?.toLowerCase() || null,
        firstName: userData.firstName,
        lastName: userData.lastName,
        passwordHash: null, // No password for OAuth users
        authProvider: userData.authProvider,
        providerId: userData.providerId,
      })
      .returning();

    return user;
  }

  // Authenticate user with email/password
  static async authenticateEmailUser(email: string, password: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.email, email.toLowerCase()),
          eq(users.authProvider, "email")
        )
      );

    if (!user || !user.passwordHash) {
      return null;
    }

    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    return isValidPassword ? user : null;
  }

  // Find user by OAuth provider and provider ID
  static async findUserByProvider(authProvider: AuthProvider, providerId: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.authProvider, authProvider),
          eq(users.providerId, providerId)
        )
      );

    return user || null;
  }

  // Authenticate OAuth user by provider ID
  static async authenticateOAuthUser(authProvider: AuthProvider, providerId: string): Promise<User | null> {
    return this.findUserByProvider(authProvider, providerId);
  }

  // Find user by ID
  static async findUserById(id: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));

    return user || null;
  }

  // Find user by email (across all auth providers)
  static async findUserByEmail(email: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    return user || null;
  }

  // Find user by email and auth provider
  static async findUserByEmailAndProvider(email: string, authProvider: AuthProvider): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.email, email.toLowerCase()),
          eq(users.authProvider, authProvider)
        )
      );

    return user || null;
  }

  // Check if provider account already exists
  static async isProviderAccountExists(authProvider: AuthProvider, providerId: string): Promise<boolean> {
    const user = await this.findUserByProvider(authProvider, providerId);
    return !!user;
  }

  // Check if email account already exists
  static async isEmailAccountExists(email: string): Promise<boolean> {
    const user = await this.findUserByEmailAndProvider(email, "email");
    return !!user;
  }
}