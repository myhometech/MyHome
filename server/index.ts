import dotenv from 'dotenv';
dotenv.config();

// Validate auth configuration early in startup
import "./config/auth.js";
import { validateAuthConfig } from "./startup/checkAuthConfig.js";

// AUTH-324: Validate OAuth configuration before proceeding
validateAuthConfig();

// Enable manual garbage collection if available
if (global.gc) {
  console.log('✅ Manual GC enabled');
  // Force immediate GC to reduce startup memory pressure
  const beforeGC = process.memoryUsage().heapUsed / 1024 / 1024;
  global.gc();
  const afterGC = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`🧹 Startup GC: ${beforeGC.toFixed(1)}MB → ${afterGC.toFixed(1)}MB (freed ${(beforeGC - afterGC).toFixed(1)}MB)`);
} else {
  console.log('ℹ️ Manual GC not available - using standard memory management');
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
import { serveStatic } from "./staticFiles";
const log = console.log;
import { withCorrelationId } from "./middleware/correlationId.js";
import { setupSimpleAuth } from "./simpleAuth.js";
import { thumbnailRateAdapter, thumbnailRateErrorHandler } from "./middleware/thumbnailRateAdapter";
import cors from "cors";
import multer from "multer";

// TEMPORARILY DISABLE AGGRESSIVE MEMORY MANAGEMENT
console.log('ℹ️  Simplified memory management enabled');

// Simplified memory monitoring - only log, don't intervene
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

  // Only log severe memory pressure (95%+), don't try to fix it
  if (heapPercent > 95) {
    console.log(`⚠️ Memory critical: ${heapPercent}% (${Math.round(memUsage.heapUsed / 1024 / 1024)}MB)`);
  }
}, 60000); // Every 60 seconds, less frequent

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

// TICKET 8: Initialize Email Render Worker
import { emailRenderWorker } from './emailRenderWorker';
import { initializeWorkerHealthChecker } from './workerHealthCheck';

const app = express();

// AUTH-GOOG-01: Enable trust proxy for correct HTTPS detection behind proxies
app.set('trust proxy', 1);

// CORS Configuration - Must be at top of middleware stack
const allowedOrigins =
  (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

const defaultOrigins = [
  "https://app.myhome.com",
  "https://www.app.myhome.com",
  // CURRENT Vercel deployment
  "https://my-home-g2bk-git-main-myhomes-projects-fe4f7b58.vercel.app",
];

const origins = allowedOrigins.length ? allowedOrigins : defaultOrigins;

app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin/non-browser requests and allowed origins
      if (!origin || origins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "x-correlation-id"],
  })
);

// Health check for Render (fast: no DB/Redis touches) - with explicit CORS
app.get("/api/health", cors(), (_req, res) => {
  res.status(200).send("ok");
});

// Increased limits for Mailgun email ingestion (emails can be large with attachments)
app.use(express.json({ 
  limit: '30mb' // Below Replit's 32MiB limit
}));
app.use(express.urlencoded({ 
  extended: true,
  limit: '30mb' // Below Replit's 32MiB limit
}));

// Fast preflight for all routes
app.options("*", cors());

// Add correlation ID middleware first
app.use(withCorrelationId as any);

// THMB-UNBLOCK: Add thumbnail rate adapter before other middleware
app.use(thumbnailRateAdapter);

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
  console.log('🚀 File path:', __filename);
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

  // EMERGENCY FIX: Register bypass email handler before middleware
  const { storage } = await import('./storage');

  // Configure multer for multipart form data (what Mailgun forwarding sends)
  const bypassUpload = multer({ dest: '/tmp/', limits: { fileSize: 10 * 1024 * 1024 } });

  app.post('/api/email-ingest-bypass', bypassUpload.any(), async (req: any, res) => {
    try {
      console.log('🚀 BYPASS EMAIL INGEST: Request received');
      console.log('📧 Raw body keys:', Object.keys(req.body || {}));
      console.log('📧 Raw body values:', req.body);
      console.log('📧 Files received:', req.files?.length || 0);
      if (req.files && req.files.length > 0) {
        console.log('📧 File details:', req.files.map((f: any) => ({ fieldname: f.fieldname, originalname: f.originalname, size: f.size })));
      }

      const { recipient, sender, subject, 'body-plain': bodyPlain, 'body-html': bodyHtml } = req.body;
      console.log('📧 Extracted fields:', { recipient, sender, subject, bodyPlain: !!bodyPlain, bodyHtml: !!bodyHtml });

      if (!recipient || !sender || !subject) {
        console.log('⚠️ Missing fields check:', { hasRecipient: !!recipient, hasSender: !!sender, hasSubject: !!subject });
        return res.status(400).json({ error: 'Missing required email fields' });
      }

      const userMatch = recipient.match(/upload\+([a-zA-Z0-9\-]+)@/);
      if (!userMatch) {
        return res.status(400).json({ error: 'Invalid recipient format' });
      }

      const userId = userMatch[1];
      console.log(`👤 User ID extracted: ${userId}`);

      if (bodyPlain || bodyHtml) {
        console.log('📄 Creating email body PDF...');

        // Create email body PDF data
        const emailData = {
          messageId: req.body['Message-Id'] || `bypass-${Date.now()}`,
          from: sender,
          to: [recipient],
          subject: subject || 'Untitled Email',
          receivedAt: new Date().toISOString(),
          ingestGroupId: null,
          categoryId: null,
          tags: ['email', 'email-body']
        };

        // Generate simple PDF content - for now just create a basic HTML structure
        const htmlContent = bodyHtml || `<p>${bodyPlain?.replace(/\n/g, '<br>') || 'No content'}</p>`;
        const pdfContent = `
          <html><head>
            <title>${subject || 'Email'}</title>
            <style>body { font-family: Arial, sans-serif; margin: 20px; }</style>
          </head><body>
            <h2>Email: ${subject || 'No Subject'}</h2>
            <p><strong>From:</strong> ${sender}</p>
            <p><strong>To:</strong> ${recipient}</p>
            <hr>
            ${htmlContent}
          </body></html>
        `;

        // Convert HTML to buffer (simplified for testing - in production use Puppeteer)
        const pdfBuffer = Buffer.from(pdfContent, 'utf8');

        const emailBodyDocument = await storage.createEmailBodyDocument(userId, emailData, pdfBuffer);

        console.log(`✅ Email body PDF created: Document ID ${emailBodyDocument.id}`);

        return res.status(200).json({
          message: 'Email body PDF created successfully',
          documentId: emailBodyDocument.id,
          filename: emailBodyDocument.fileName
        });
      } else {
        return res.status(200).json({
          message: 'Email processed - no content to convert',
          reason: 'no_content'
        });
      }
    } catch (error) {
      console.error('❌ Bypass email ingest error:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // CRITICAL FIX: Register routes BEFORE static file serving to prevent interception
  const server = await registerRoutes(app);
  console.log('✅ API routes registered successfully');

  // EMAIL INGESTION FIX: Force override any route conflicts
  console.log('🚑 [EMAIL-INGEST] Registering GET endpoint override...');
  app.use('/api/email-ingest', (req: any, res, next) => {
    if (req.method === 'GET') {
      console.log('📞 [EMAIL-INGEST] GET endpoint accessed for webhook verification');
      return res.status(200).json({ 
        status: 'ok', 
        service: 'email-ingest', 
        method: 'GET',
        message: 'Mailgun webhook endpoint is accessible',
        timestamp: new Date().toISOString()
      });
    }
    next();
  });

  // THMB-UNBLOCK: Add thumbnail rate error handler after routes
  app.use(thumbnailRateErrorHandler);

  // Initialize manual event notification service (TICKET B2)
  try {
    const { manualEventNotificationService } = await import('./manualEventNotificationService');
    manualEventNotificationService.initialize();
  } catch (error: any) {
    console.warn('⚠️  Could not initialize manual event notification service (non-critical):', error.message);
  }

  // TICKET 8: Initialize Email Render Worker
  try {
    console.log('🎬 Initializing Email Render Worker...');
    const worker = await emailRenderWorker.initialize();
    initializeWorkerHealthChecker(worker);
    console.log('✅ Email Render Worker initialized successfully');
  } catch (error: any) {
    console.error('❌ Email Render Worker initialization failed:', error.message);
    console.warn('⚠️ Email body PDF processing will fallback to inline rendering');
    initializeWorkerHealthChecker(null);
  }

  // TICKET: CloudConvert healthcheck at startup
  try {
    console.log('🔍 Running CloudConvert healthcheck...');
    const { cloudConvertHealthcheck } = await import('./cloudConvertService.js');
    await cloudConvertHealthcheck();
    console.log('✅ CloudConvert healthcheck passed - service is ready');
  } catch (error: any) {
    console.error('❌ CloudConvert healthcheck failed:', error.message);
    if (error.code === 'CLOUDCONVERT_API_KEY missing') {
      console.warn('⚠️ CloudConvert API key not configured - conversions will be skipped');
    } else {
      console.warn('⚠️ CloudConvert service unavailable - ingestion will store originals only');
    }
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

  if (false) { console.log("Dev Vite disabled in server build"); } else {
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

  // EMAIL INGESTION FIX: Register GET endpoint EARLY to prevent route conflicts
  app.get('/api/email-ingest', (req: any, res) => {
    console.log('📞 [EMAIL-INGEST] GET verification endpoint accessed');
    res.status(200).json({ 
      status: 'ok', 
      service: 'email-ingest', 
      method: 'GET',
      message: 'Mailgun webhook endpoint is accessible',
      timestamp: new Date().toISOString()
    });
  });

  // MAILGUN FORWARD TEST: Simple test endpoint for forwarding
  const forwardUpload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
  app.post('/api/mailgun-forward-test', forwardUpload.any(), (req: any, res) => {
    console.log('🚑 MAILGUN FORWARD TEST: Request received');
    console.log('📧 Headers:', Object.keys(req.headers));
    console.log('📧 Body keys:', Object.keys(req.body || {}));
    console.log('📧 Body data:', req.body);
    console.log('📧 Files count:', req.files?.length || 0);

    return res.status(200).json({
      success: true,
      received: {
        bodyKeys: Object.keys(req.body || {}),
        body: req.body,
        filesCount: req.files?.length || 0,
        contentType: req.headers['content-type']
      },
      message: 'Mailgun forwarding test successful'
    });
  });

  // CRITICAL: Exclude email forwarding endpoints from authentication BEFORE auth setup
  const publicRoutes = ['/api/email-ingest', '/api/email-ingest-bypass', '/api/mailgun-forward-test'];
  app.use((req, res, next) => {
    if (publicRoutes.includes(req.path)) {
      console.log(`🔓 [AUTH-BYPASS] Allowing unauthenticated access to ${req.path}`);
      // Skip to route handlers, bypass auth middleware entirely
      return next();
    }
    next();
  });

  // Apply auth middleware (after bypass check)
  setupSimpleAuth(app);

  // Debug middleware order
  app.use((req: any, res, next) => {
    if (req.path.startsWith('/api/') && req.path !== '/api/health') {
      console.log(`[MIDDLEWARE-DEBUG] ${req.method} ${req.path}:`, {
        hasSession: !!req.session,
        hasSessionUser: !!req.session?.user,
        hasReqUser: !!req.user,
        sessionId: req.session?.id?.substring(0, 8) + '...',
        cookies: Object.keys(req.cookies || {})
      });
    }
    next();
  });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const serverPort = parseInt(process.env.PORT || "5000", 10);
  const serverHost = process.env.HOST || "0.0.0.0";

  // DEPLOYMENT DEBUG: Log all registered routes before starting server
  console.log('🔧 REGISTERED ROUTES SUMMARY:');
  console.log('   GET / (root endpoint)');
  console.log('   GET /debug');
  console.log('   GET /api/email-ingest');
  console.log('   POST /api/email-ingest');

  // EMAIL FORWARDING: Simple GET endpoint for Mailgun webhook verification
  app.get('/api/email-ingest', (req: any, res) => {
    console.log('📞 /api/email-ingest GET endpoint called for webhook verification');
    res.status(200).json({ 
      status: 'ok', 
      service: 'email-ingest', 
      method: 'GET',
      message: 'Mailgun webhook endpoint is accessible' 
    });
  });
  console.log(`🚀 Starting server on port ${serverPort} with NODE_ENV=${process.env.NODE_ENV}`);

  // DEPLOYMENT FIX: Add deployment environment detection (already declared above)

  if (isDeployment) {
    console.log('🚀 DEPLOYMENT MODE: Configuring for Replit deployment');
    console.log('🚀 PORT configuration:', serverPort);
    console.log('🚀 REPLIT_DEPLOYMENT:', process.env.REPLIT_DEPLOYMENT);
  }

  // Start server with port retry logic
  const tryStartServer = (attemptPort: number, attempt: number = 1): void => {
    const serverInstance = server.listen({
      port: attemptPort,
      host: serverHost,
    }, () => {
      log(`serving on port ${attemptPort}`);
      console.log(`🌐 Server ready at http://${serverHost}:${attemptPort}`);
      console.log('✅ MyHome application is now accessible in preview');

      if (isDeployment) {
        console.log('✅ DEPLOYMENT: Server successfully started and listening');
        console.log('✅ DEPLOYMENT: Routes should now be accessible');
      }
    }).on('error', (err: any) => {
      console.error(`❌ Server failed to start on port ${attemptPort}:`, err);

      if (err.code === 'EADDRINUSE' && attempt < 3) {
        console.log(`🔄 Port ${attemptPort} in use, trying port ${attemptPort + 1} (attempt ${attempt + 1}/3)...`);
        setTimeout(() => {
          tryStartServer(attemptPort + 1, attempt + 1);
        }, 1000);
      } else if (err.code === 'EADDRINUSE') {
        console.log('❌ All ports exhausted, forcing cleanup and exit...');
        process.exit(2);
      } else {
        process.exit(1);
      }
    });
  };

 // tryStartServer(serverPort);
  // --- START SERVER: Express listens directly (Render/Replit) ---
  app.listen(serverPort, serverHost, () => {
    console.log(`\xF0\x9F\x8C\x90 Server ready at http://${serverHost}:${serverPort}`);
  });
  // --- END START SERVER ---
})();
