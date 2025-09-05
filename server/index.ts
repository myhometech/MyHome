import passport from "passport";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import session from "express-session";
import cors from "cors";
import path from "path";

// ✅ Load Passport/Google strategy and any auth config
import "./config/auth.js";

// ✅ Centralized route registration (includes /auth/google)
import { registerRoutes } from "./routes";

const app = express();

// Behind proxies (Render) so Secure cookies work
app.set("trust proxy", 1);

// ---- CORS (env-driven) ----
const normalize = (s?: string) =>
  (s || "").trim().toLowerCase().replace(/\/+$/,"");

const originsFromEnv =
  (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(normalize)
    .filter(Boolean);

const defaultOrigins = [
  "https://my-home-g2bk.vercel.app",
  "https://my-home-g2bk-git-main-myhomes-projects-fe4f7b58.vercel.app",
];

const allowed = originsFromEnv.length ? originsFromEnv : defaultOrigins;

const corsOptions: cors.CorsOptions = {
  origin(incoming, cb) {
    const o = normalize(incoming as string | undefined);
    if (!o) return cb(null, true);            // curl/non-browser
    if (allowed.includes(o)) return cb(null, true);
    return cb(null, false);                   // no headers; caller will see CORS block
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Authorization","Content-Type","x-correlation-id"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Safety net to ensure ACAO/ACC present for allowed origins
app.use((req, res, next) => {
  const o = normalize(req.headers.origin as string | undefined);
  if (o && allowed.includes(o)) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  next();
});

// ---- Sessions (cross-site) ----
app.use(session({
  name: "connect.sid",
  secret: process.env.SESSION_SECRET || "dev_secret_change_me_please",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,       // Required for cross-site cookies
    sameSite: "none",   // Required for cross-site cookies
  },
}));


app.use(passport.initialize());
app.use(passport.session());
// ---- Basic body parsing (keep light) ----
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ---- Health route (CORS-wrapped) ----
app.get("/api/health", cors(corsOptions), (_req, res) => res.send("ok"));

// --- Direct Google OAuth routes (ensure session attaches user) ---
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"], session: true }));
app.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/login?error=oauth_failed", session: true }), (req, res) => { const FRONTEND = process.env.FRONTEND_ORIGIN || "https://my-home-g2bk.vercel.app"; try { (req as any).session.user = (req as any).user || null; } catch {} if ((req as any).session?.save) { (req as any).session.save(() => res.redirect(302, FRONTEND)); } else { res.redirect(302, FRONTEND); } })
);
// --- end Google OAuth routes ---


// TEMP: debug session/user
app.get("/api/auth/_debug", (req, res) => {
  res.json({
    hasSession: !!req.session,
    sessionId: (req.session && req.session.id) || null,
    hasUser: !!req.user,
    user: req.user || null,
    cookieHeader: req.headers.cookie || null
  });
});


// Redirect backend /login to frontend login (preserve query string)
app.get("/login", (req, res) => {
  const FRONTEND = process.env.FRONTEND_ORIGIN || "https://my-home-g2bk.vercel.app";
  const qs = req.originalUrl.includes("?") ? ("?" + req.originalUrl.split("?")[1]) : "";
  res.redirect(302, `${FRONTEND}/login${qs}`);
});


// ---- Register all app routes (includes /auth/google) ----
(async () => {
  // registerRoutes wires up everything under /auth, /api, etc.
  const server = await registerRoutes(app);

  // Production: serve static files only if present (no vite import)
  if (process.env.NODE_ENV === "production") {
    const publicDir = path.join(__dirname, "../public");
    app.use(express.static(publicDir));
    app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
  }

  const port = Number(process.env.PORT || 5000);
  const host = process.env.HOST || "0.0.0.0";

  server.listen({ port, host }, () => {
    console.log(`🚀 Server listening on http://${host}:${port}`);
    console.log("[CORS] Allowed origins:", allowed);
  });
})();
