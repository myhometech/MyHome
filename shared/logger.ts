// Centralized logging utility with production guards
const isDevelopment = typeof process !== 'undefined' ? 
  process.env.NODE_ENV !== 'production' : 
  import.meta.env?.MODE !== 'production';

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  
  error: (...args: any[]) => {
    if (isDevelopment) {
      console.error(...args);
    }
  },
  
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
};

// For client-side debugging
export const clientLogger = {
  log: (...args: any[]) => {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.log(...args);
    }
  },
  
  error: (...args: any[]) => {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.error(...args);
    }
  }
};