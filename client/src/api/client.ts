import { apiRequest } from '../lib/queryClient';
import { getConfig } from '../config';

/**
 * Centralized API client for all HTTP requests
 * Uses runtime configuration for base URL to work in all environments
 */
export const api = {
  async get<T = any>(endpoint: string): Promise<T> {
    const response = await fetch(this.buildUrl(endpoint), {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  },

  async post<T = any>(endpoint: string, data?: any): Promise<T> {
    const response = await apiRequest('POST', endpoint, data);
    return response.json();
  },

  async put<T = any>(endpoint: string, data?: any): Promise<T> {
    const response = await apiRequest('PUT', endpoint, data);
    return response.json();
  },

  async patch<T = any>(endpoint: string, data?: any): Promise<T> {
    const response = await apiRequest('PATCH', endpoint, data);
    return response.json();
  },

  async delete<T = any>(endpoint: string): Promise<T> {
    const response = await apiRequest('DELETE', endpoint);
    return response.json();
  },

  buildUrl(endpoint: string): string {
    const config = getConfig();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const baseUrl = config.API_BASE_URL.endsWith('/') 
      ? config.API_BASE_URL.slice(0, -1) 
      : config.API_BASE_URL;
    return `${baseUrl}/${cleanEndpoint}`;
  }
};