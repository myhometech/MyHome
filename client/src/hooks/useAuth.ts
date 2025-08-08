import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: (failureCount, error) => {
      // Log auth failures for debugging
      // Auth query failed - debug info removed for production
      return failureCount < 2; // Retry once
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Debug logging
  // Auth state debug removed for production

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error
  };
}
