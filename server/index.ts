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

// Start system health monitoring
monitorSystemHealth();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// CRITICAL MEMORY MANAGEMENT: Emergency fixes for critical heap usage
console.log('🚨 CRITICAL MEMORY MODE: Applying emergency memory management');

// Force garbage collection every 15 seconds (more aggressive)
setInterval(() => {
  if (global.gc) {
    const beforeMem = process.memoryUsage();
    global.gc();
    const afterMem = process.memoryUsage();
    const heapUsedMB = Math.round(afterMem.heapUsed/1024/1024);
    const heapTotalMB = Math.round(afterMem.heapTotal/1024/1024);
    const heapPercent = Math.round((afterMem.heapUsed / afterMem.heapTotal) * 100);
    const freedMB = Math.round((beforeMem.heapUsed - afterMem.heapUsed)/1024/1024);
    console.log(`🧹 GC: ${heapUsedMB}MB/${heapTotalMB}MB (${heapPercent}%) freed ${freedMB}MB`);
    
    // Emergency action if still critical
    if (heapPercent > 95) {
      console.error('🚨 EMERGENCY: Memory still critical after GC');
    }
  }
}, 15000);

// Enable memory profiling
process.env.MEMORY_PROFILING = 'true';

// Log initial memory state
const initialMem = process.memoryUsage();
console.log(`📊 Initial memory: ${Math.round(initialMem.heapUsed/1024/1024)}MB heap (${Math.round((initialMem.heapUsed/initialMem.heapTotal)*100)}%)`);

// Import memory profiler, memory manager, and session cleanup
Promise.all([
  import('./memoryProfiler.js'),
  import('./memoryManager.js'),
  import('./sessionCleanup.js')
]).then(([{ memoryProfiler }, { memoryManager }, { sessionCleanup }]) => {
  console.log('🔍 Memory profiler loaded');
  console.log('🔧 Memory manager loaded');
  console.log('🧹 Session cleanup loaded');
  
  // Take immediate snapshot
  setTimeout(() => {
    const report = memoryProfiler.generateReport();
    console.log('📊 Memory Profile Report:', report);
  }, 5000);
}).catch(error => {
  console.error('Failed to load memory profiler:', error);
});

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
