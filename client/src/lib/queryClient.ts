import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getConfig } from "../config";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      const json = await res.json();
      // Use the message from the API response if available
      const errorMessage = json.message || json.error || res.statusText;
      throw new Error(`${res.status}: ${errorMessage}`);
    } catch (parseError) {
      // If JSON parsing fails, fallback to text
      const text = await res.text() || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }
  }
}

function buildApiUrl(endpoint: string): string {
  const config = getConfig();
  // Remove leading slash from endpoint if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  // Ensure API_BASE_URL doesn't end with slash to avoid double slashes
  const baseUrl = config.API_BASE_URL.endsWith('/') 
    ? config.API_BASE_URL.slice(0, -1) 
    : config.API_BASE_URL;
  return `${baseUrl}/${cleanEndpoint}`;
}

export async function apiRequest(
  method: string,
  endpoint: string,
  data?: unknown | undefined,
): Promise<Response> {
  const url = buildApiUrl(endpoint);
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Build URL using config instead of direct concatenation
    const endpoint = queryKey.join("/");
    const url = buildApiUrl(endpoint);
    
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) {
          return false;
        }
        return failureCount < 3;
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000, // Garbage collect after 10 minutes
    },
    mutations: {
      retry: false,
    },
  },
});

// Periodic cache cleanup to prevent memory leaks
setInterval(() => {
  queryClient.clear();
}, 15 * 60 * 1000); // Clear cache every 15 minutes