import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface VehicleFetchError {
  type: 'auth' | 'forbidden' | 'server';
  code?: string;
  cid?: string;
  message: string;
}

export async function fetchVehicles(): Promise<any[]> {
  const res = await fetch('/api/vehicles', { credentials: 'include' });
  
  if (res.status === 401) {
    throw { type: 'auth', message: 'You need to sign in.' } as VehicleFetchError;
  }
  
  if (res.status === 403) {
    throw { type: 'forbidden', message: 'You lack access to Vehicles.' } as VehicleFetchError;
  }
  
  if (!res.ok) {
    const errorData = await safeJson(res);
    throw { 
      type: 'server', 
      code: errorData.code, 
      cid: errorData.cid, 
      message: 'Could not load vehicles.' 
    } as VehicleFetchError;
  }
  
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function safeJson(r: Response) { 
  try { 
    return await r.json(); 
  } catch { 
    return {}; 
  } 
}

export function useVehicles() {
  return useQuery({
    queryKey: ['/api/vehicles'],
    queryFn: fetchVehicles,
    retry: (failureCount, error: any) => {
      // Don't retry auth errors
      if (error?.type === 'auth') return false;
      if (error?.type === 'forbidden') return false;
      return failureCount < 2;
    }
  });
}