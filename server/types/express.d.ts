/**
 * Type declarations for Express.js and Passport.js integration
 */

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string | null;
      role?: string;
      household?: {
        id: string;
        role: string;
        name?: string;
      };
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      role?: string;
      household?: {
        id: string;
        role: string;
        name?: string;
      };
    };
  }
}

export {};