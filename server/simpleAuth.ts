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
  
  return session({
    secret: process.env.SESSION_SECRET || "simple-auth-secret-key-for-development",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: 'lax',
      domain: undefined, // Let the browser handle domain automatically
    },
  });
}

export function setupSimpleAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  
  // Remove debug middleware
}

export const requireAuth: RequestHandler = (req: any, res, next) => {
  // Check both session-based auth (simpleAuth) and passport auth
  const sessionUser = req.session?.user;
  const passportUser = req.user;
  
  // Use either auth method
  const user = sessionUser || passportUser;
  
  if (!user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  
  // Ensure req.user is set for both auth methods
  req.user = user;
  
  // Also ensure session compatibility
  if (!req.session?.user && user) {
    req.session.user = user;
  }
  
  next();
};