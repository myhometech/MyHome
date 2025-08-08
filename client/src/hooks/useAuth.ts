import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: (failureCount, error) => {
      // Log auth failures for debugging
      console.log('[AUTH DEBUG] Query failed:', { failureCount, error });
      return failureCount < 2; // Retry once
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Debug logging
  console.log('[AUTH DEBUG] useAuth state:', { user, isLoading, isAuthenticated: !!user, error });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error
  };
}
