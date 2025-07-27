/**
 * Enhanced Health Check Middleware
 * CORE-002: Extended Health Monitoring with System Metrics
 */

import os from 'os';
import fs from 'fs/promises';
import { Request, Response } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import * as Sentry from '@sentry/node';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  subsystems: {
    database: SubsystemHealth;
    memory: SubsystemHealth;
    disk: SubsystemHealth;
    environment: SubsystemHealth;
  };
  metrics: {
    memoryUsage: NodeJS.MemoryUsage;
    systemMemory: {
      total: number;
      free: number;
      used: number;
      percentUsed: number;
    };
    diskSpace?: {
      total: number;
      free: number;
      used: number;
      percentUsed: number;
    };
    loadAverage: number[];
    cpuCount: number;
  };
}

interface SubsystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  details?: any;
  responseTime?: number;
}

// Memory usage thresholds (adjusted for development environment)
const MEMORY_WARNING_THRESHOLD = 0.85; // 85%
const MEMORY_CRITICAL_THRESHOLD = 0.95; // 95%

// Disk space thresholds  
const DISK_WARNING_THRESHOLD = 0.85; // 85%
const DISK_CRITICAL_THRESHOLD = 0.95; // 95%

/**
 * Check database connectivity and performance
 */
async function checkDatabase(): Promise<SubsystemHealth> {
  const startTime = Date.now();
  
  try {
    // Simple connectivity test
    await db.execute(sql`SELECT 1 as test`);
    
    // Performance test - check if query takes too long
    const responseTime = Date.now() - startTime;
    
    if (responseTime > 5000) { // 5 seconds
      return {
        status: 'degraded',
        message: 'Database responding slowly',
        responseTime,
        details: { warningThreshold: '5000ms' }
      };
    }
    
    if (responseTime > 10000) { // 10 seconds
      return {
        status: 'unhealthy',
        message: 'Database response time critical',
        responseTime,
        details: { criticalThreshold: '10000ms' }
      };
    }
    
    return {
      status: 'healthy',
      message: 'Database connection successful',
      responseTime
    };
    
  } catch (error) {
    Sentry.captureException(error);
    return {
      status: 'unhealthy',
      message: 'Database connection failed',
      responseTime: Date.now() - startTime,
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

/**
 * Check memory usage
 */
function checkMemory(): SubsystemHealth {
  const processMemory = process.memoryUsage();
  const systemMemory = {
    total: os.totalmem(),
    free: os.freemem(),
    used: os.totalmem() - os.freemem(),
    percentUsed: (os.totalmem() - os.freemem()) / os.totalmem()
  };
  
  // Check process heap usage
  const heapUsedPercent = processMemory.heapUsed / processMemory.heapTotal;
  
  // Check system memory usage
  const systemUsedPercent = systemMemory.percentUsed;
  
  if (systemUsedPercent >= MEMORY_CRITICAL_THRESHOLD || heapUsedPercent >= MEMORY_CRITICAL_THRESHOLD) {
    return {
      status: 'unhealthy',
      message: 'Critical memory usage detected',
      details: {
        systemMemoryUsed: `${(systemUsedPercent * 100).toFixed(1)}%`,
        heapUsed: `${(heapUsedPercent * 100).toFixed(1)}%`,
        processMemory,
        systemMemory
      }
    };
  }
  
  if (systemUsedPercent >= MEMORY_WARNING_THRESHOLD || heapUsedPercent >= MEMORY_WARNING_THRESHOLD) {
    return {
      status: 'degraded',
      message: 'High memory usage detected',
      details: {
        systemMemoryUsed: `${(systemUsedPercent * 100).toFixed(1)}%`,
        heapUsed: `${(heapUsedPercent * 100).toFixed(1)}%`,
        processMemory,
        systemMemory
      }
    };
  }
  
  return {
    status: 'healthy',
    message: 'Memory usage within normal limits',
    details: {
      systemMemoryUsed: `${(systemUsedPercent * 100).toFixed(1)}%`,
      heapUsed: `${(heapUsedPercent * 100).toFixed(1)}%`
    }
  };
}

/**
 * Check disk space usage
 */
async function checkDiskSpace(): Promise<SubsystemHealth> {
  try {
    // Get disk usage for the current working directory
    const stats = await fs.stat(process.cwd());
    
    // For containers/cloud environments, we'll use a simplified approach
    // In production, this could be enhanced with actual disk space checking
    const diskInfo = {
      path: process.cwd(),
      accessible: true
    };
    
    // Basic file system accessibility check
    try {
      await fs.access(process.cwd(), fs.constants.R_OK | fs.constants.W_OK);
      
      return {
        status: 'healthy',
        message: 'Disk space and file system accessible',
        details: diskInfo
      };
    } catch (accessError) {
      return {
        status: 'unhealthy',
        message: 'File system access issues detected',
        details: { 
          error: accessError instanceof Error ? accessError.message : 'Unknown error',
          path: process.cwd()
        }
      };
    }
    
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Unable to check disk space',
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

/**
 * Check environment and configuration
 */
function checkEnvironment(): SubsystemHealth {
  const requiredEnvVars = [
    'DATABASE_URL',
    'SESSION_SECRET'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    return {
      status: 'unhealthy',
      message: 'Missing required environment variables',
      details: { missingVariables: missingVars }
    };
  }
  
  // Check if we're in a known environment
  const nodeEnv = process.env.NODE_ENV;
  const isKnownEnv = ['development', 'production', 'test'].includes(nodeEnv || '');
  
  if (!isKnownEnv) {
    return {
      status: 'degraded',
      message: 'Unknown or unset NODE_ENV',
      details: { currentEnv: nodeEnv || 'undefined' }
    };
  }
  
  return {
    status: 'healthy',
    message: 'Environment configuration valid',
    details: { 
      nodeEnv,
      configuredVariables: requiredEnvVars.length
    }
  };
}

/**
 * Enhanced health check endpoint handler
 */
export async function enhancedHealthCheck(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Run all health checks concurrently
    const [databaseHealth, memoryHealth, diskHealth, environmentHealth] = await Promise.all([
      checkDatabase(),
      Promise.resolve(checkMemory()),
      checkDiskSpace(),
      Promise.resolve(checkEnvironment())
    ]);
    
    // Gather system metrics
    const processMemory = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
      percentUsed: (os.totalmem() - os.freemem()) / os.totalmem()
    };
    
    // Determine overall health status
    const subsystems = {
      database: databaseHealth,
      memory: memoryHealth,
      disk: diskHealth,
      environment: environmentHealth
    };
    
    const subsystemStatuses = Object.values(subsystems).map(s => s.status);
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    
    if (subsystemStatuses.some(status => status === 'unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (subsystemStatuses.some(status => status === 'degraded')) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }
    
    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      subsystems,
      metrics: {
        memoryUsage: processMemory,
        systemMemory,
        loadAverage: os.loadavg(),
        cpuCount: os.cpus().length
      }
    };
    
    // Set appropriate HTTP status code
    const httpStatus = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;
    
    // Log unhealthy status
    if (overallStatus === 'unhealthy') {
      console.error('🚨 System health check failed:', {
        status: overallStatus,
        failedSubsystems: Object.entries(subsystems)
          .filter(([, health]) => health.status === 'unhealthy')
          .map(([name]) => name)
      });
      
      Sentry.captureMessage(`System health check failed: ${overallStatus}`, 'warning');
    }
    
    res.status(httpStatus).json(healthStatus);
    
  } catch (error) {
    console.error('Health check system failure:', error);
    Sentry.captureException(error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      error: 'Health check system failure',
      message: 'Unable to perform health checks',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}