import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  const { data: user = null, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      console.log('[AUTH] Checking authentication status...');
      
      const response = await fetch('/api/auth/user', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.log('[AUTH] User not authenticated');
          return null; // User is not authenticated
        }
        console.error('[AUTH] Authentication check failed:', response.status);
        throw new Error(`Authentication failed: ${response.status}`);
      }

      const userData = await response.json();
      console.log('[AUTH] User authenticated:', userData.id);
      return userData;
    },
    retry: (failureCount, error: any) => {
      // Don't retry on 401 errors
      if (error?.message?.includes('401')) {
        return false;
      }
      return failureCount < 2;
    },
    staleTime: 1 * 60 * 1000, // 1 minute (shorter for faster updates)
    refetchOnWindowFocus: true, // Re-check when window gains focus
    refetchOnMount: true, // Always check on mount
    initialData: null, // Ensure user starts as null
  });

  return {
    user,
    isLoading,
    error,
    refetch,
    isAuthenticated: !!user && !isLoading
  };
}