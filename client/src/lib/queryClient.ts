/* ensure cookies are sent with all fetches */
if (typeof window!=="undefined"){
  const _fetch = window.fetch.bind(window);
  window.fetch = (input, init={}) => _fetch(input, { credentials: "include", ...(init||{}) });
}

import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;

    try {
      // Read the response body as text first
      const text = await res.text();

      if (text) {
        try {
          // Try to parse as JSON
          const json = JSON.parse(text);
          errorMessage = json.message || json.error || text;
        } catch {
          // If not valid JSON, use the text directly
          errorMessage = text;
        }
      }
    } catch {
      // If reading fails entirely, use status text
      errorMessage = res.statusText;
    }

    throw new Error(`${res.status}: ${errorMessage}`);
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = url.startsWith('/') ? `${API_BASE_URL}${url}` : url;
  const res = await fetch(fullUrl, {
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
    const url = queryKey.join("/") as string;
    const fullUrl = url.startsWith('/') ? `${API_BASE_URL}${url}` : url;
    const res = await fetch(fullUrl, {
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
      staleTime: 3 * 60 * 1000, // 3 minutes (reduced from 5)
      gcTime: 5 * 60 * 1000, // 5 minutes (reduced from 10)
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: 1,
      gcTime: 2 * 60 * 1000, // 2 minutes for mutations
    },
  },
});

// Aggressive cleanup for memory optimization
if (typeof window !== 'undefined') {
  // Clear unused queries every 3 minutes
  setInterval(() => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();

    // Remove queries that haven't been used recently
    queries.forEach((query) => {
      const lastUsed = query.state.dataUpdatedAt || query.state.errorUpdatedAt || 0;
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

      if (lastUsed < fiveMinutesAgo && query.getObserversCount() === 0) {
        cache.remove(query);
      }
    });

    // Also clear mutation cache
    const mutationCache = queryClient.getMutationCache();
    const mutations = mutationCache.getAll();

    mutations.forEach((mutation) => {
      const lastUsed = mutation.state.submittedAt || 0;
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

      if (lastUsed < tenMinutesAgo) {
        mutationCache.remove(mutation);
      }
    });

    console.log('🧹 Query cache cleaned:', {
      remainingQueries: queryClient.getQueryCache().getAll().length,
      remainingMutations: queryClient.getMutationCache().getAll().length
    });
  }, 3 * 60 * 1000); // Every 3 minutes
}
