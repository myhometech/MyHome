import dotenv from 'dotenv'; dotenv.config();

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';

import './config/auth.js';           // ensures Google strategy + serialize/deserialize are registered
import { registerRoutes } from './routes';

const app = express();
app.set('trust proxy', 1);

// ---------- CORS (allow Vercel) ----------
const norm = (s?: string) => (s || '').trim().toLowerCase().replace(/\/+$/, '');
const defaults = [
  'https://my-home-g2bk.vercel.app',
  'https://my-home-g2bk-git-main-myhomes-projects-fe4f7b58.vercel.app'
];
const allowed = Array.from(new Set(
  ((process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(norm).filter(Boolean)).concat(defaults)
));
const corsOpts: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const o = norm(origin);
    cb(null, allowed.includes(o));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Authorization','Content-Type','x-correlation-id'],
};
app.use(cors(corsOpts));
app.options('*', cors(corsOpts));
app.use((req, res, next) => {
  const o = (req.headers.origin as string) || '';
  const n = norm(o);
  if (n && allowed.includes(n)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

// ---------- Parsers ----------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------- Session (required for Passport state + login) ----------
app.use(session({
  name: 'connect.sid',
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: 'none' }
}));

// ---------- Passport (must come AFTER session) ----------
app.use(passport.initialize());
app.use(passport.session());

// ---------- Health ----------
app.get('/api/health', (_req, res) => res.send('ok'));

// ---------- Google OAuth (direct) ----------
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: true })
);
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=oauth_failed', session: true }),
  (req, res) => {
    try { (req as any).session.user = (req as any).user || null; } catch {}
    const FRONTEND = process.env.FRONTEND_ORIGIN || 'https://my-home-g2bk.vercel.app';
    if ((req as any).session?.save) (req as any).session.save(() => res.redirect(302, FRONTEND));
    else res.redirect(302, FRONTEND);
  }
);

// ---------- Redirect backend /login to frontend ----------
app.get('/login', (req, res) => {
  const FRONTEND = process.env.FRONTEND_ORIGIN || 'https://my-home-g2bk.vercel.app';
  const qs = req.originalUrl.includes('?') ? ('?' + req.originalUrl.split('?')[1]) : '';
  res.redirect(302, `${FRONTEND}/login${qs}`);
});

// ---------- TEMP debug ----------
app.get('/api/auth/_debug', (req, res) => {
  res.json({
    hasSession: !!(req as any).session,
    sessionId: (req as any).session?.id || null,
    hasUser: !!(req as any).user,
    user: (req as any).user || null,
    sessionUser: (req as any).session?.user || null
  });
});

// ---------- Register remaining routes & start ----------
(async () => {
  const server = await registerRoutes(app);
  const port = Number(process.env.PORT || 5000);
  const host = process.env.HOST || '0.0.0.0';
  server.listen({ port, host }, () => {
    console.log(`serving on port ${port}`);
  });
})();
