/**
 * TICKET 2: DVLA Vehicle Lookup Service
 * 
 * Service for querying the DVLA Vehicle Enquiry API to fetch vehicle details
 * by Vehicle Registration Number (VRN). Maps DVLA JSON response to our 
 * vehicles table format.
 */

import { Vehicle, InsertVehicle } from '@shared/schema';

// DVLA API configuration
const DVLA_API_BASE_URL = 'https://driver-vehicle-licensing.api.gov.uk';
const DVLA_VEHICLE_ENQUIRY_ENDPOINT = '/vehicle-enquiry/v1/vehicles';

// DVLA API response interfaces
interface DVLAVehicleResponse {
  registrationNumber: string;
  taxStatus: string;
  taxDueDate?: string;
  artEndDate?: string; // Alternative to taxDueDate for some vehicles
  motStatus: string;
  motExpiryDate?: string;
  make: string;
  monthOfFirstRegistration?: string;
  yearOfManufacture: number;
  engineCapacity?: number;
  co2Emissions?: number;
  fuelType: string;
  markedForExport?: boolean;
  colour: string;
  typeApproval?: string;
  wheelplan?: string;
  revenueWeight?: number;
  realDrivingEmissions?: string;
  dateOfLastV5CIssued?: string;
  euroStatus?: string;
}

interface DVLAErrorResponse {
  errors: Array<{
    status: string;
    code: string;
    title: string;
    detail: string;
  }>;
}

// Service response types
export interface DVLALookupResult {
  success: boolean;
  vehicle?: Partial<InsertVehicle>;
  error?: {
    code: string;
    message: string;
    status: number;
  };
}

export class DVLALookupService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.DVLA_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️ DVLA_API_KEY not configured - DVLA lookups will fail');
    }
  }

  /**
   * Query DVLA API for vehicle details by VRN
   */
  async lookupVehicleByVRN(vrn: string): Promise<DVLALookupResult> {
    if (!this.apiKey) {
      return {
        success: false,
        error: {
          code: 'NO_API_KEY',
          message: 'DVLA API key not configured',
          status: 500
        }
      };
    }

    // Normalize VRN (remove spaces, convert to uppercase)
    const normalizedVRN = vrn.replace(/\s/g, '').toUpperCase();

    try {
      console.log(`🔍 DVLA Lookup: Querying vehicle ${normalizedVRN}`);

      const response = await fetch(`${DVLA_API_BASE_URL}${DVLA_VEHICLE_ENQUIRY_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'User-Agent': 'MyHome-DVLA-Integration/1.0'
        },
        body: JSON.stringify({
          registrationNumber: normalizedVRN
        })
      });

      const responseData = await response.json();

      // Handle different response codes
      switch (response.status) {
        case 200:
          return this.handleSuccessResponse(responseData as DVLAVehicleResponse);
        
        case 400:
          return this.handleErrorResponse(400, 'BAD_REQUEST', 'Invalid request format or VRN');
        
        case 404:
          return this.handleErrorResponse(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found in DVLA records');
        
        case 429:
          return this.handleErrorResponse(429, 'RATE_LIMITED', 'DVLA API rate limit exceeded');
        
        case 500:
        case 503:
          return this.handleErrorResponse(response.status, 'DVLA_SERVER_ERROR', 'DVLA service temporarily unavailable');
        
        default:
          console.error('🚨 DVLA API unexpected response:', response.status, responseData);
          return this.handleErrorResponse(response.status, 'UNKNOWN_ERROR', 'Unexpected response from DVLA API');
      }

    } catch (error) {
      console.error('🚨 DVLA API request failed:', error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Failed to connect to DVLA API',
          status: 500
        }
      };
    }
  }

  /**
   * Handle successful DVLA API response and map to our vehicle format
   */
  private handleSuccessResponse(dvlaData: DVLAVehicleResponse): DVLALookupResult {
    try {
      console.log('✅ DVLA Lookup successful:', dvlaData.registrationNumber);

      // Map DVLA response to our vehicle format
      const vehicle: Partial<InsertVehicle> = {
        vrn: dvlaData.registrationNumber,
        make: dvlaData.make,
        yearOfManufacture: dvlaData.yearOfManufacture,
        fuelType: this.normalizeFuelType(dvlaData.fuelType),
        colour: this.normalizeColour(dvlaData.colour),
        taxStatus: this.normalizeTaxStatus(dvlaData.taxStatus),
        taxDueDate: this.parseDate(dvlaData.taxDueDate || dvlaData.artEndDate),
        motStatus: this.normalizeMotStatus(dvlaData.motStatus),
        motExpiryDate: this.parseDate(dvlaData.motExpiryDate),
        co2Emissions: dvlaData.co2Emissions,
        euroStatus: dvlaData.euroStatus,
        engineCapacity: dvlaData.engineCapacity,
        revenueWeight: dvlaData.revenueWeight,
        source: 'dvla',
        dvlaLastRefreshed: new Date()
      };

      // Remove undefined fields
      const cleanedVehicle = Object.fromEntries(
        Object.entries(vehicle).filter(([_, value]) => value !== undefined)
      ) as Partial<InsertVehicle>;

      return {
        success: true,
        vehicle: cleanedVehicle
      };

    } catch (error) {
      console.error('🚨 Error mapping DVLA response:', error);
      return {
        success: false,
        error: {
          code: 'MAPPING_ERROR',
          message: 'Failed to process DVLA response data',
          status: 500
        }
      };
    }
  }

  /**
   * Handle error responses from DVLA API
   */
  private handleErrorResponse(status: number, code: string, message: string): DVLALookupResult {
    console.warn(`⚠️ DVLA API Error: ${status} - ${code}: ${message}`);
    
    return {
      success: false,
      error: {
        code,
        message,
        status
      }
    };
  }

  /**
   * Data normalization helpers
   */
  private normalizeFuelType(fuelType: string): string {
    const fuelTypeMap: Record<string, string> = {
      'PETROL': 'Petrol',
      'DIESEL': 'Diesel',
      'ELECTRIC': 'Electric',
      'HYBRID': 'Hybrid',
      'GAS': 'Gas',
      'GAS BI-FUEL': 'Gas Bi-fuel',
      'FUEL CELL': 'Fuel Cell'
    };
    
    return fuelTypeMap[fuelType.toUpperCase()] || fuelType;
  }

  private normalizeColour(colour: string): string {
    // Capitalize first letter of each word
    return colour.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }

  private normalizeTaxStatus(taxStatus: string): string {
    const taxStatusMap: Record<string, string> = {
      'TAXED': 'Taxed',
      'NOT TAXED': 'Untaxed',
      'SORN': 'SORN',
      'UNTAXED': 'Untaxed'
    };
    
    return taxStatusMap[taxStatus.toUpperCase()] || taxStatus;
  }

  private normalizeMotStatus(motStatus: string): string {
    const motStatusMap: Record<string, string> = {
      'VALID': 'Valid',
      'NO DETAILS HELD': 'No details held',
      'EXPIRED': 'Expired',
      'NOT VALID': 'Expired'
    };
    
    return motStatusMap[motStatus.toUpperCase()] || motStatus;
  }

  private parseDate(dateString?: string): Date | undefined {
    if (!dateString) return undefined;
    
    try {
      // DVLA dates are in YYYY-MM-DD format
      const parsedDate = new Date(dateString);
      return isNaN(parsedDate.getTime()) ? undefined : parsedDate;
    } catch {
      return undefined;
    }
  }

  /**
   * Check if DVLA API is available
   */
  async checkDVLAAvailability(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Test with a deliberately invalid VRN to check API availability
      const response = await fetch(`${DVLA_API_BASE_URL}${DVLA_VEHICLE_ENQUIRY_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'User-Agent': 'MyHome-DVLA-Integration/1.0'
        },
        body: JSON.stringify({
          registrationNumber: 'TEST123'
        })
      });

      // Any response (even 404) means the API is available
      return response.status >= 200 && response.status < 600;

    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const dvlaLookupService = new DVLALookupService();