import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { AuthService } from "./authService";
import createMemoryStore from 'memorystore';

export function getSession() {
  const isProd = process.env.NODE_ENV === 'production';

  // Use PostgreSQL for persistent sessions in both dev and production
  const PgSession = connectPg(session);
  const sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'sessions',
    createTableIfMissing: true,
  });

  return session({
    name: 'mh.sid',
    secret: process.env.SESSION_SECRET || "simple-auth-secret-key-for-development",
    store: sessionStore, // Use PostgreSQL session store
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true, // AUTH-GOOG-01: Always use secure cookies for OAuth
      sameSite: 'none', // AUTH-GOOG-01: Required for cross-site OAuth on Replit
      domain: undefined, // AUTH-GOOG-01: Don't force domain on Replit subdomains
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
    rolling: true, // Extend session on activity
  });
}

export function setupSimpleAuth(app: Express) {
  // Session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || "dev-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: new (createMemoryStore(session))({
      checkPeriod: 86400000 // 24 hours cleanup interval
    }),
    rolling: true, // Reset expiry on activity
    cookie: {
      secure: true, // AUTH-GOOG-01: Always secure for OAuth
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: "none" // AUTH-GOOG-01: Cross-site for Replit OAuth
    }
  }));

  // Enhanced middleware to attach user from session to request with better persistence
  app.use((req: any, res, next) => {
    if (req.session && req.session.user && !req.user) {
      req.user = req.session.user;

      // Ensure session data consistency
      if (!req.session.userId && req.session.user.id) {
        req.session.userId = req.session.user.id;
      }
      if (!req.session.email && req.session.user.email) {
        req.session.email = req.session.user.email;
      }
    }

    // If session exists but user is missing, try to restore from session properties
    if (req.session && !req.session.user && req.session.userId) {
      req.session.user = {
        id: req.session.userId,
        email: req.session.email,
        firstName: req.session.firstName,
        lastName: req.session.lastName,
        role: req.session.role,
        household: req.session.household
      };
      req.user = req.session.user;
    }

    next();
  });
}

export const requireAuth: RequestHandler = (req: any, res: any, next: any) => {
  // Check both session and req.user (for different auth methods)
  const user = req.user || req.session?.user;

  // Enhanced debugging for auth issues
  console.log('[SIMPLE-AUTH] requireAuth check:', {
    hasReqUser: !!req.user,
    hasSessionUser: !!req.session?.user,
    sessionId: req.session?.id?.substring(0, 8) + '...',
    path: req.path,
    method: req.method
  });

  if (!user) {
    console.warn('[SIMPLE-AUTH] Authentication failed:', {
      sessionExists: !!req.session,
      sessionUser: req.session?.user ? 'present' : 'missing',
      cookies: Object.keys(req.cookies || {}),
      userAgent: req.get('User-Agent')?.substring(0, 50)
    });

    return res.status(401).json({
      message: "Authentication required",
      debug: process.env.NODE_ENV === 'development' ? {
        sessionExists: !!req.session,
        cookiesPresent: Object.keys(req.cookies || {}).length > 0
      } : undefined
    });
  }

  // Ensure req.user is set for downstream middleware
  req.user = user;
  next();
};