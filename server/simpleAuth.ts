import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { AuthService } from "./authService";

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
      secure: isProd, // true behind HTTPS
      sameSite: isProd ? 'none' : 'lax', // 'none' if frontend & API are cross-site
      domain: isProd ? '.myhome-docs.com' : undefined,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
    rolling: true, // Extend session on activity
  });
}

export function setupSimpleAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Remove debug middleware
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