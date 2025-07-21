import bcrypt from "bcryptjs";
import crypto from "crypto";
import { users, type User } from "@shared/schema";
import { db } from "./db";
import { eq, or } from "drizzle-orm";

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

  // Generate secure random token
  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
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
    const verificationToken = this.generateToken();

    const [user] = await db
      .insert(users)
      .values({
        id: userId,
        email: userData.email.toLowerCase(),
        firstName: userData.firstName,
        lastName: userData.lastName,
        passwordHash,
        authProvider: "email",
        isVerified: false,
        verificationToken,
      })
      .returning();

    return user;
  }

  // Create or update Google OAuth user
  static async upsertGoogleUser(googleProfile: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  }): Promise<User> {
    // Check if user exists by Google ID or email
    const [existingUser] = await db
      .select()
      .from(users)
      .where(or(
        eq(users.googleId, googleProfile.id),
        eq(users.email, googleProfile.email.toLowerCase())
      ));

    if (existingUser) {
      // Update existing user with Google info
      const [updatedUser] = await db
        .update(users)
        .set({
          googleId: googleProfile.id,
          authProvider: "google",
          firstName: googleProfile.firstName || existingUser.firstName,
          lastName: googleProfile.lastName || existingUser.lastName,
          profileImageUrl: googleProfile.profileImageUrl || existingUser.profileImageUrl,
          isVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      return updatedUser;
    } else {
      // Create new Google user
      const userId = crypto.randomUUID();
      const [newUser] = await db
        .insert(users)
        .values({
          id: userId,
          email: googleProfile.email.toLowerCase(),
          firstName: googleProfile.firstName,
          lastName: googleProfile.lastName,
          profileImageUrl: googleProfile.profileImageUrl,
          googleId: googleProfile.id,
          authProvider: "google",
          isVerified: true,
        })
        .returning();

      return newUser;
    }
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

  // Verify email with token
  static async verifyEmail(token: string): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.verificationToken, token));

    if (!user) {
      return false;
    }

    await db
      .update(users)
      .set({
        isVerified: true,
        verificationToken: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return true;
  }

  // Generate password reset token
  static async generatePasswordResetToken(email: string): Promise<string | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    if (!user) {
      return null;
    }

    const resetToken = this.generateToken();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await db
      .update(users)
      .set({
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetExpires,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return resetToken;
  }

  // Reset password with token
  static async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.resetPasswordToken, token));

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return false;
    }

    const passwordHash = await this.hashPassword(newPassword);

    await db
      .update(users)
      .set({
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return true;
  }
}