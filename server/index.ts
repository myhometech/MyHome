import dotenv from 'dotenv';
dotenv.config();

// Enable manual garbage collection if available
if (global.gc) {
  console.log('✅ Manual GC enabled');
} else {
  console.warn('⚠️ Manual GC not available - start with --expose-gc for better memory management');
}

// Initialize error tracking and monitoring first
import { initializeSentry, monitorSystemHealth } from "./monitoring";
initializeSentry();

// DEPLOYMENT FIX: Check deployment environment once
const isDeployment = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';

// TEMPORARILY DISABLE SYSTEM MONITORING TO RESOLVE STARTUP ISSUES
// if (!isDeployment) {
//   // Start system health monitoring
//   monitorSystemHealth();
// } else {
//   console.log('ℹ️  Deployment mode: Skipping system health monitoring');
// }

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// TEMPORARILY DISABLE AGGRESSIVE MEMORY MANAGEMENT
console.log('ℹ️  Simplified memory management enabled');

// Basic GC only when needed (less aggressive)
if (!isDeployment && global.gc) {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

    // More aggressive GC due to current 97% heap usage
    if (heapPercent > 80 && global.gc) {
      global.gc();
      console.log(`🧹 GC: Memory was ${heapPercent}%, running cleanup`);
    }
  }, 15000); // Every 15 seconds for current memory pressure
}

// SIMPLIFIED STARTUP: Minimal logging only
if (!isDeployment) {
  const initialMem = process.memoryUsage();
  console.log(`📊 Initial memory: ${Math.round(initialMem.heapUsed/1024/1024)}MB heap`);

  // Load only session cleanup to prevent memory leaks
  import('./sessionCleanup.js').then(({ sessionCleanup }) => {
    console.log('🧹 Session cleanup loaded');
  }).catch(error => {
    console.warn('Session cleanup failed to load:', error.message);
  });
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
  // DEPLOYMENT DIAGNOSTIC: Confirm startup execution
  console.log('🚀 PRODUCTION DEPLOYMENT: server/index.ts executing at:', new Date().toISOString());
  console.log('🚀 DEPLOYMENT CONFIRMATION: Routes will be registered and server will start on port:', process.env.PORT || 5000);
  console.log('🚀 NODE_ENV:', process.env.NODE_ENV);
  console.log('🚀 File path:', import.meta.url);
  console.log('🚀 Process arguments:', process.argv);
  console.log('🚀 Working directory:', process.cwd());

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

  // Register main routes to handle all routing - no duplicates needed
  const deploymentMarker = Date.now();
  console.log('🔧 ROUTE REGISTRATION: Registering all routes via routes.ts');
  console.log(`🚀 DEPLOYMENT MARKER: ${deploymentMarker}`);

  // CRITICAL FIX: Register routes BEFORE static file serving to prevent interception
  const server = await registerRoutes(app);
  console.log('✅ API routes registered successfully');

  // Initialize manual event notification service (TICKET B2)
  try {
    const { manualEventNotificationService } = await import('./manualEventNotificationService');
    manualEventNotificationService.initialize();
  } catch (error: any) {
    console.warn('⚠️  Could not initialize manual event notification service (non-critical):', error.message);
  }

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  // DEPLOYMENT FIX: Use consistent environment detection
  const nodeEnv = process.env.NODE_ENV;
  const appEnv = app.get("env");
  // const isDeployment = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production'; // Redundant declaration, using the one declared at the top
  console.log('🚨 EXPRESS SERVER STARTUP: This confirms the server is executing');
  console.log('🚨 REPLIT_DEPLOYMENT env:', process.env.REPLIT_DEPLOYMENT);
  console.log('🚨 Production detection:', { NODE_ENV: process.env.NODE_ENV, isDeployment });
  console.log(`🔧 Environment check: NODE_ENV=${nodeEnv}, app.env=${appEnv}, isDeployment=${isDeployment}`);

  if (nodeEnv === "development" && !isDeployment) {
    console.log('🔧 Setting up Vite development server');
    await setupVite(app, server);
  } else {
    console.log('🔧 PRODUCTION MODE: Setting up static file serving for deployment');
    console.log('🔧 Static files will be served from dist/public directory');
    console.log('⚠️ IMPORTANT: Static file serving configured AFTER API routes to prevent route interception');
    try {
      serveStatic(app);
      console.log('✅ Static file serving configured successfully for production');
    } catch (error) {
      console.error('❌ Static file serving failed:', (error as Error).message);
      // Continue without static files to prevent total failure
    }
  }

  // Add error handling AFTER static file setup to avoid interfering with routes
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "0.0.0.0";

  // DEPLOYMENT DEBUG: Log all registered routes before starting server
  console.log('🔧 REGISTERED ROUTES SUMMARY:');
  console.log('   GET / (root endpoint)');
  console.log('   GET /debug');
  console.log('   GET /api/email-ingest');
  console.log('   POST /api/email-ingest');
  console.log(`🚀 Starting server on port ${port} with NODE_ENV=${process.env.NODE_ENV}`);

  // DEPLOYMENT FIX: Add deployment environment detection (already declared above)

  if (isDeployment) {
    console.log('🚀 DEPLOYMENT MODE: Configuring for Replit deployment');
    console.log('🚀 PORT configuration:', port);
    console.log('🚀 REPLIT_DEPLOYMENT:', process.env.REPLIT_DEPLOYMENT);
  }

  server.listen({
    port,
    host,
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    console.log(`🌐 Server ready at http://${host}:${port}`);

    if (isDeployment) {
      console.log('✅ DEPLOYMENT: Server successfully started and listening');
      console.log('✅ DEPLOYMENT: Routes should now be accessible');
    }
  });
})();