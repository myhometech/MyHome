import express from "express";
import session from "express-session";
import cors from "cors";
import path from "path";

const app = express();

// Trust Render's reverse proxy so Secure cookies work
app.set("trust proxy", 1);

// CORS setup
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "").split(",");
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

// Session setup
app.use(
  session({
    name: "connect.sid",
    secret: process.env.SESSION_SECRET || "dev_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    },
  })
);

// Health check
app.get("/api/health", (_req, res) => {
  res.send("ok");
});

// Auth user route
app.get("/api/auth/user", (req, res) => {
  try {
    const user = (req as any).session?.user || (req as any).user;
    if (!user) {
      console.log("[AUTH] unauthenticated /api/auth/user");
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    }
    return res.status(200).json({ user });
  } catch (err: any) {
    console.error("[AUTH] /api/auth/user error:", err?.message || err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  const publicDir = path.join(__dirname, "../public");
  app.use(express.static(publicDir));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

const port = Number(process.env.PORT) || 5000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${port}`);
});
