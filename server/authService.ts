import bcrypt from "bcryptjs";
import crypto from "crypto";
import { users, type User, type InsertUser } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
      })
      .returning();

    return user;
  }

  // Authenticate user with email/password
  static async authenticateEmailUser(email: string, password: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    if (!user || !user.passwordHash) {
      return null;
    }

    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    return isValidPassword ? user : null;
  }

  // Find user by ID
  static async findUserById(id: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));

    return user || null;
  }

  // Find user by email
  static async findUserByEmail(email: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    return user || null;
  }
}