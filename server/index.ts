import dotenv from 'dotenv';
dotenv.config();

// Initialize error tracking and monitoring first
import { initializeSentry, monitorSystemHealth } from "./monitoring";
initializeSentry();

// Start system health monitoring
monitorSystemHealth();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// PRODUCTION WHITE SCREEN FIX: Aggressive memory management
if (process.env.NODE_ENV === 'production') {
  console.log('🚨 PRODUCTION MODE: Applying memory fixes for white screen issue');
  
  // Force garbage collection every 30 seconds
  setInterval(() => {
    if (global.gc) {
      global.gc();
      const mem = process.memoryUsage();
      const heapUsedMB = Math.round(mem.heapUsed/1024/1024);
      const heapTotalMB = Math.round(mem.heapTotal/1024/1024);
      const heapPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);
      console.log(`🧹 GC: ${heapUsedMB}MB/${heapTotalMB}MB (${heapPercent}%)`);
    }
  }, 30000);
  
  // CRITICAL: Disable GCS completely in production to prevent memory leak causing white screen
  process.env.STORAGE_TYPE = 'local';
  delete process.env.GCS_BUCKET_NAME;
  delete process.env.GCS_PROJECT_ID;
  delete process.env.GCS_CREDENTIALS;
  console.log('🛡️ GCS disabled in production to prevent memory leak');
  
  // Log initial memory state
  const initialMem = process.memoryUsage();
  console.log(`📊 Initial memory: ${Math.round(initialMem.heapUsed/1024/1024)}MB heap`);
}

// Import backup service only in development to prevent memory issues
let backupService: any = null;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // PRODUCTION WHITE SCREEN FIX: Completely disable backup service in production
  if (process.env.NODE_ENV !== 'production') {
    try {
      // Dynamic import prevents loading GCS modules in production  
      const { backupService: bs } = await import('./backupService.js');
      backupService = bs;
      backupService.initialize()
        .then(() => console.log('✅ Backup service initialized successfully'))
        .catch((error: any) => console.warn('⚠️ Backup service initialization failed (non-critical):', error.message));
    } catch (importError: any) {
      console.warn('⚠️ Could not import backup service (non-critical):', importError.message);
    }
  } else {
    console.log('ℹ️ Backup service disabled in production');
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
