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
  
  // Add session debugging middleware
  app.use((req: any, res, next) => {
    console.log("Session debug:", {
      sessionID: req.sessionID,
      hasUser: !!req.session?.user,
      userID: req.session?.user?.id,
      cookies: req.headers.cookie ? "present" : "missing"
    });
    next();
  });
}

export const requireAuth: RequestHandler = (req: any, res, next) => {
  if (!req.session?.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  
  req.user = req.session.user;
  next();
};