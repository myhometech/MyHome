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
    },
  });
}

export function setupSimpleAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
}

export const requireAuth: RequestHandler = (req: any, res, next) => {
  if (!req.session?.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  
  req.user = req.session.user;
  next();
};