
export interface ConnectionHealth {
  isOnline: boolean;
  serverReachable: boolean;
  apiEndpointReachable: boolean;
  lastSuccessfulRequest?: Date;
  diagnostics: {
    userAgent: string;
    url: string;
    timestamp: string;
  };
}

export class ConnectionHealthService {
  private static lastSuccessfulRequest?: Date;

  static async checkHealth(): Promise<ConnectionHealth> {
    const diagnostics = {
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString()
    };

    // Basic online check
    const isOnline = navigator.onLine;
    
    let serverReachable = false;
    let apiEndpointReachable = false;

    if (isOnline) {
      // Test server connectivity
      try {
        const healthResponse = await fetch('/api/health', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-cache'
        });
        serverReachable = healthResponse.ok;
      } catch (error) {
        console.warn('Server health check failed:', error);
        serverReachable = false;
      }

      // Test documents API specifically
      try {
        const documentsResponse = await fetch('/api/documents?limit=1', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-cache'
        });
        apiEndpointReachable = documentsResponse.ok || documentsResponse.status === 401; // 401 means server is reachable but auth required
        
        if (documentsResponse.ok) {
          this.lastSuccessfulRequest = new Date();
        }
      } catch (error) {
        console.warn('Documents API health check failed:', error);
        apiEndpointReachable = false;
      }
    }

    return {
      isOnline,
      serverReachable,
      apiEndpointReachable,
      lastSuccessfulRequest: this.lastSuccessfulRequest,
      diagnostics
    };
  }

  static async runDiagnostics(): Promise<string[]> {
    const health = await this.checkHealth();
    const issues: string[] = [];

    if (!health.isOnline) {
      issues.push('Device appears to be offline');
    }

    if (health.isOnline && !health.serverReachable) {
      issues.push('Server is not reachable - possible deployment issue');
    }

    if (health.serverReachable && !health.apiEndpointReachable) {
      issues.push('API endpoints are not responding - possible authentication or CORS issue');
    }

    if (!health.lastSuccessfulRequest) {
      issues.push('No successful API requests recorded in this session');
    }

    return issues;
  }
}
