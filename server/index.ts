import dotenv from 'dotenv';
dotenv.config();

// Enable manual garbage collection if available
if (global.gc && process.env.NODE_ENV !== 'production') {
  console.log('✅ Manual GC enabled');
} else if (process.env.NODE_ENV !== 'production') {
  console.warn('⚠️ Manual GC not available - start with --expose-gc for better memory management');
}

// Initialize error tracking and monitoring first
import { initializeSentry, monitorSystemHealth } from "./monitoring";
initializeSentry();

// DEPLOYMENT FIX: Check deployment environment once
const isDeployment = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';

// DEVELOPMENT PERFORMANCE FIX: Disable all monitoring in development
if (process.env.NODE_ENV === 'development') {
  console.log('ℹ️  Development mode: All monitoring disabled for performance');
} else {
  console.log('ℹ️  Production mode: System monitoring available if needed');
}

import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// TEMPORARILY DISABLE AGGRESSIVE MEMORY MANAGEMENT
if (process.env.NODE_ENV !== 'production') {
  console.log('ℹ️  Simplified memory management enabled');
}

// DEVELOPMENT FIX: Reduce GC frequency to prevent interference
if (!isDeployment && global.gc) {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

    // Less aggressive GC in development
    if (heapPercent > 90 && global.gc) {
      global.gc();
    }
  }, 60000); // Every 60 seconds to reduce interference
}

// SIMPLIFIED STARTUP: Minimal logging only
if (!isDeployment && process.env.NODE_ENV !== 'production') {
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

// ANTI-UPSTREAM CSP OVERRIDE: Prevent any upstream proxy interference
app.use((req, res, next) => {
  // Remove any existing CSP headers that might be set by upstream proxies or other middleware
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("content-security-policy");
  res.removeHeader("Content-security-policy");
  
  // Set our comprehensive CSP policy
  const cspPolicy = isDeployment 
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://docs.opencv.org https://js.stripe.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob: https://myhome-docs.com https://storage.googleapis.com https://*.googleusercontent.com https://images.unsplash.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' https://api.stripe.com https://api.openai.com https://storage.googleapis.com",
        "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
        "object-src 'none'",
        "frame-ancestors 'none'"
      ].join('; ') + ';'
    : [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://docs.opencv.org https://*.replit.app https://*.replit.dev blob:",
        "style-src 'self' 'unsafe-inline'", 
        "img-src 'self' data: blob: https://myhome-docs.com https://*.replit.app https://*.replit.dev *",
        "font-src 'self' data:",
        "connect-src 'self' wss: ws: https://*.replit.app https://*.replit.dev",
        "object-src 'none'",
        "frame-ancestors 'none'"
      ].join('; ') + ';';
      
  res.setHeader("Content-Security-Policy", cspPolicy);
  
  // Monitor for upstream interference
  res.on('finish', () => {
    const finalHeaders = res.getHeaders();
    const finalCSP = finalHeaders['content-security-policy'];
    
    if (finalCSP !== cspPolicy) {
      console.error('🚨 UPSTREAM CSP INTERFERENCE DETECTED!');
      console.error('🚨 Expected CSP:', cspPolicy);
      console.error('🚨 Actual CSP:', finalCSP);
      console.error('🚨 All Response Headers:', Object.keys(finalHeaders));
    }
  });
  
  next();
});

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

  // DEVELOPMENT PERFORMANCE FIX: Disable backup service in development too
  console.log('ℹ️ Backup service disabled for better development performance');

  // Register main routes to handle all routing - no duplicates needed
  const deploymentMarker = Date.now();
  console.log('🔧 ROUTE REGISTRATION: Registering all routes via routes.ts');
  console.log(`🚀 DEPLOYMENT MARKER: ${deploymentMarker}`);

  // ===== Pre-Middleware Endpoints (No Auth Required) =====
  // These endpoints need to be registered BEFORE main routes to avoid middleware interference
  
  // Health Check Endpoint
  app.get('/healthz', (_req, res) => {
    res.json({ 
      status: 'ok', 
      version: process.env.GIT_SHA || 'dev',
      timestamp: new Date().toISOString()
    });
  });

  // Config File Serving
  app.get('/config.json', (_req, res) => {
    const configPath = path.resolve(process.cwd(), 'server', 'public', 'config.json');
    if (!fs.existsSync(configPath)) {
      // Fallback to client config if server config doesn't exist
      const fallbackConfigPath = path.resolve(process.cwd(), 'client', 'public', 'config.json');
      if (fs.existsSync(fallbackConfigPath)) {
        res.sendFile(fallbackConfigPath);
      } else {
        res.status(404).json({ error: 'Configuration file not found' });
      }
    } else {
      res.sendFile(configPath);
    }
  });

  // CRITICAL FIX: Register routes AFTER pre-middleware endpoints
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
    console.log('🔧 Static files will be served from client/dist directory');
    console.log('⚠️ IMPORTANT: Static file serving configured AFTER API routes to prevent route interception');
    try {
      // ===== Static Frontend Assets =====
      const distPath = path.resolve(process.cwd(), "client", "dist");
      
      console.log('🔍 Static directory path:', distPath);
      console.log('🔍 Static directory exists:', fs.existsSync(distPath));
      
      if (!fs.existsSync(distPath)) {
        throw new Error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
      }
      
      // Serve static assets from client/dist
      app.use(express.static(distPath));
      console.log('✅ Static assets configured from:', distPath);
      
      // ===== SPA Fallback - Only for non-API routes =====
      app.get('*', (req, res, next) => {
        // Skip API routes
        if (req.path.startsWith('/api')) {
          return next();
        }
        
        // Skip healthz and config endpoints  
        if (req.path === '/healthz' || req.path === '/config.json') {
          return next();
        }
        
        // Serve index.html for all other routes (SPA fallback)
        const indexPath = path.resolve(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).json({ error: 'Frontend build not found' });
        }
      });
      
      console.log('✅ SPA fallback configured successfully');
      
      if (fs.existsSync(distPath)) {
        const files = fs.readdirSync(distPath);
        console.log('🔍 Static files found:', files.slice(0, 5)); // Show first 5 files
      }
    } catch (error) {
      console.error('❌ Static file serving failed:', (error as Error).message);
      console.error('❌ This means the frontend build is missing or misconfigured');
      // Continue without static files to prevent total failure
    }
  }

  // CSP override is now applied early in middleware chain

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