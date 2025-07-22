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
  console.log("requireAuth middleware called");
  console.log("Session exists:", !!req.session);
  console.log("Session user:", req.session?.user?.email || "none");
  console.log("Session ID:", req.sessionID);
  console.log("Cookie header:", req.headers.cookie);
  
  if (!req.session?.user) {
    console.log("Authentication failed - no session user");
    return res.status(401).json({ message: "Authentication required" });
  }
  
  console.log("Authentication successful for user:", req.session.user.email);
  req.user = req.session.user;
  next();
};