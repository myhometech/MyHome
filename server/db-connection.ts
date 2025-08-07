import { pool as neonPool } from './db';
import CircuitBreaker from 'opossum';
import type { PoolClient } from '@neondatabase/serverless';

// Use the Neon pool from db.ts instead of creating a new one

// Check if error is transient and worth retrying
function isTransientError(error: any): boolean {
  const transientCodes = [
    'ECONNRESET',
    'ECONNREFUSED', 
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    '57P01', // PostgreSQL admin shutdown
    '53300', // PostgreSQL too many connections
    '08006', // Connection failure
    '08001', // Unable to connect
    '08003', // Connection does not exist
    '08004', // Connection rejected
  ];

  return transientCodes.some(code => 
    error.code === code || 
    error.message?.includes(code) ||
    error.message?.includes('terminating connection') ||
    error.message?.includes('Connection terminated') ||
    error.message?.includes('server closed the connection')
  );
}

// Wait function for backoff delays
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry wrapper with exponential backoff
async function retryQuery<T>(
  queryFn: () => Promise<T>, 
  attempts: number = 3,
  operation: string = 'query'
): Promise<T> {
  let lastError: any;

  for (let i = 0; i < attempts; i++) {
    try {
      console.log(`Attempting ${operation} (attempt ${i + 1}/${attempts})`);
      const result = await queryFn();

      if (i > 0) {
        console.log(`${operation} succeeded after ${i + 1} attempts`);
      }

      return result;
    } catch (err: any) {
      lastError = err;
      console.error(`${operation} attempt ${i + 1} failed:`, err.message);

      // Don't retry on last attempt or non-transient errors
      if (i === attempts - 1 || !isTransientError(err)) {
        console.error(`${operation} failed permanently:`, err.message);
        throw err;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = 1000 * Math.pow(2, i);
      console.log(`Retrying ${operation} in ${delay}ms...`);
      await wait(delay);
    }
  }

  throw lastError;
}

// Database query function with retry logic
async function executeQuery<T = any>(
  text: string, 
  params: any[] = [],
  operation: string = 'query'
): Promise<T> {
  return retryQuery(async () => {
    const client = await neonPool.connect();
    try {
      const result = await client.query(text, params);
      return result.rows as T;
    } finally {
      client.release();
    }
  }, 3, operation);
}

// Circuit breaker for database operations
const dbCircuitBreaker = new CircuitBreaker(executeQuery, {
  timeout: 10000, // 10 second timeout
  errorThresholdPercentage: 50, // Open circuit at 50% failure rate
  resetTimeout: 15000, // Try to close circuit after 15 seconds
  rollingCountTimeout: 30000, // 30 second window for error counting
  rollingCountBuckets: 10,
  name: 'database-circuit-breaker'
});

// Circuit breaker event handlers
dbCircuitBreaker.on('open', () => {
  console.error('🚨 Database circuit breaker OPENED - Database is temporarily unavailable');
});

dbCircuitBreaker.on('halfOpen', () => {
  console.warn('⚠️  Database circuit breaker HALF-OPEN - Testing database availability');
});

dbCircuitBreaker.on('close', () => {
  console.log('✅ Database circuit breaker CLOSED - Database is available');
});

dbCircuitBreaker.on('fallback', (result: any) => {
  console.warn('🔄 Database circuit breaker FALLBACK triggered');
});

// Safe database query with circuit breaker
export async function safeQuery<T = any>(
  text: string, 
  params: any[] = [],
  operation: string = 'query',
  fallbackResult: T | null = null
): Promise<T | null> {
  try {
    // Use circuit breaker to protect against cascading failures
    const result = await dbCircuitBreaker.fire(text, params, operation);
    return result;
  } catch (error: any) {
    console.error(`Database ${operation} failed:`, error.message);

    // Check if circuit is open
    if (dbCircuitBreaker.opened) {
      console.warn('Circuit breaker is open, returning fallback result');
      return fallbackResult;
    }

    // For critical operations, still throw the error
    if (operation.includes('critical') || operation.includes('auth')) {
      throw error;
    }

    // For non-critical operations, return fallback
    return fallbackResult;
  }
}

// Transaction wrapper with retry logic
export async function safeTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
  operation: string = 'transaction'
): Promise<T | null> {
  return retryQuery(async () => {
    const client = await neonPool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }, 3, operation);
}

// Health check function
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: string;
  circuitState: string;
}> {
  try {
    const startTime = Date.now();
    await safeQuery('SELECT 1', [], 'health-check');
    const responseTime = Date.now() - startTime;

    return {
      status: responseTime < 1000 ? 'healthy' : 'degraded',
      details: `Response time: ${responseTime}ms`,
      circuitState: dbCircuitBreaker.opened ? 'open' : dbCircuitBreaker.halfOpen ? 'half-open' : 'closed'
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      details: error.message,
      circuitState: dbCircuitBreaker.opened ? 'open' : 'closed'
    };
  }
}

// Graceful shutdown
export async function closeDatabaseConnections(): Promise<void> {
  console.log('Closing database connections...');
  await neonPool.end();
  console.log('Database connections closed');
}

// Export the pool for direct access when needed
export { neonPool as pool };
export default safeQuery;