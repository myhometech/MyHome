import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { AuthService } from "./authService";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  const isProd = process.env.NODE_ENV === 'production';

  return session({
    name: 'mh.sid',
    secret: process.env.SESSION_SECRET || "simple-auth-secret-key-for-development",
    store: sessionStore,
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

  if (!user) {
    console.log('❌ Authentication failed - no user in session or req.user');
    console.log('❌ Session user:', req.session?.user ? 'exists' : 'missing');
    console.log('❌ Req user:', req.user ? 'exists' : 'missing');
    return res.status(401).json({ message: "Authentication required" });
  }

  // Ensure req.user is set for downstream middleware
  req.user = user;
  console.log('✅ Authentication successful for user:', user.email);
  next();
};