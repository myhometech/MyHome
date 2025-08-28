import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/header";


import SubscriptionPlans from "@/components/SubscriptionPlans";
import CategoryManagement from "@/components/category-management";
import { YourAssetsSection } from "@/components/YourAssetsSection";
import SharedAccessManagement from "@/components/shared-access-management";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, User, Bell, Shield, HelpCircle, CreditCard, Car, Plus, Calendar, FileText, Search, AlertCircle, CheckCircle, Loader2, Edit, Clock, X, RefreshCw, Users, LogOut } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useVehicles } from "@/hooks/useVehicles";
import { useState, useEffect } from "react";
import { useFeatures } from "@/hooks/useFeatures";
import { Crown } from "lucide-react";

// Vehicle interface based on the API structure
interface Vehicle {
  id: string;
  vrn: string;
  make?: string;
  model?: string;
  yearOfManufacture?: number;
  fuelType?: string;
  colour?: string;
  taxStatus?: string;
  taxDueDate?: string;
  motStatus?: string;
  motExpiryDate?: string;
  co2Emissions?: number;
  euroStatus?: string;
  engineCapacity?: number;
  revenueWeight?: number;
  source: 'dvla' | 'manual';
  notes?: string;
  dvlaLastRefreshed?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Helper function to get status color and text
const getStatusDisplay = (status?: string, dueDate?: string) => {
  if (!status && !dueDate) {
    return { color: 'text-gray-500', text: 'Unknown' };
  }
  
  if (dueDate) {
    const due = new Date(dueDate);
    const now = new Date();
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) {
      return { color: 'text-red-600', text: 'Overdue' };
    } else if (daysUntilDue <= 7) {
      return { color: 'text-orange-600', text: 'Due Soon' };
    } else if (daysUntilDue <= 30) {
      return { color: 'text-yellow-600', text: 'Due This Month' };
    } else {
      return { color: 'text-green-600', text: `Due ${due.toLocaleDateString()}` };
    }
  }
  
  // Fallback to status text
  if (status === 'Taxed') return { color: 'text-green-600', text: 'Taxed' };
  if (status === 'Valid') return { color: 'text-green-600', text: 'Valid' };
  if (status === 'Not Taxed') return { color: 'text-red-600', text: 'Not Taxed' };
  if (status === 'Expired') return { color: 'text-red-600', text: 'Expired' };
  
  return { color: 'text-gray-500', text: status || 'Unknown' };
};

// Vehicle Card Component
function VehicleCard({ vehicle, onViewDetails, onEdit, onDelete }: { 
  vehicle: Vehicle; 
  onViewDetails: (vehicle: Vehicle) => void;
  onEdit?: (vehicle: Vehicle) => void;
  onDelete?: (vehicleId: string) => void;
}) {
  const taxDisplay = getStatusDisplay(vehicle.taxStatus, vehicle.taxDueDate);
  const motDisplay = getStatusDisplay(vehicle.motStatus, vehicle.motExpiryDate);

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer h-full" onClick={() => onViewDetails(vehicle)}>
      <CardContent className="p-4 sm:p-6 h-full flex flex-col">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Car className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base sm:text-lg truncate">{vehicle.vrn}</h3>
              {vehicle.make && (
                <p className="text-gray-600 text-sm truncate">
                  {vehicle.make} {vehicle.model} {vehicle.yearOfManufacture && `(${vehicle.yearOfManufacture})`}
                </p>
              )}
            </div>
          </div>
          {vehicle.source === 'dvla' && (
            <Badge variant="secondary" className="text-xs self-start sm:self-auto flex-shrink-0">
              DVLA Verified
            </Badge>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 flex-1">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">Tax Status</span>
            </div>
            <p className={`text-xs sm:text-sm ${taxDisplay.color} break-words`}>{taxDisplay.text}</p>
          </div>
          
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">MOT Status</span>
            </div>
            <p className={`text-xs sm:text-sm ${motDisplay.color} break-words`}>{motDisplay.text}</p>
          </div>
        </div>
        
        {vehicle.notes && (
          <div className="mb-4">
            <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">{vehicle.notes}</p>
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row gap-2 mt-auto">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-xs sm:text-sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(vehicle);
            }}
          >
            View Details
          </Button>
          <div className="flex gap-2">
            {onEdit && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(vehicle);
                }}
                className="px-2"
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(vehicle.id);
                }}
                className="text-red-600 hover:text-red-700 px-2"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// DVLA Vehicle Data Interface
interface DVLAVehicleData {
  vrn: string;
  make?: string;
  model?: string;
  yearOfManufacture?: number;
  fuelType?: string;
  colour?: string;
  taxStatus?: string;
  taxDueDate?: string;
  motStatus?: string;
  motExpiryDate?: string;
  co2Emissions?: number;
  euroStatus?: string;
  engineCapacity?: number;
}

// Add Vehicle Modal Component
function AddVehicleModal({ isOpen, onClose, onVehicleAdded }: {
  isOpen: boolean;
  onClose: () => void;
  onVehicleAdded: () => void;
}) {
  const [vrn, setVrn] = useState('');
  const [dvlaData, setDvlaData] = useState<DVLAVehicleData | null>(null);
  const [notes, setNotes] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [hasLookedUp, setHasLookedUp] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset state when modal opens/closes
  const handleModalStateChange = (open: boolean) => {
    if (!open) {
      setVrn('');
      setDvlaData(null);
      setNotes('');
      setLookupError(null);
      setIsLookingUp(false);
      setHasLookedUp(false);
      onClose();
    }
  };

  // DVLA Lookup
  const handleDVLALookup = async () => {
    if (!vrn.trim()) {
      setLookupError('Please enter a VRN');
      return;
    }

    setIsLookingUp(true);
    setLookupError(null);
    setDvlaData(null);

    try {
      // This would normally be a separate lookup endpoint, but we'll use the create endpoint
      // with a test call to see DVLA data
      const response = await fetch('/api/vehicles/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vrn: vrn.trim().toUpperCase() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'DVLA lookup failed');
      }

      const data = await response.json();
      
      if (data.success && data.vehicle) {
        setDvlaData(data.vehicle);
        setLookupError(null);
      } else {
        setLookupError(data.error || 'No DVLA data found for this VRN');
        setDvlaData({
          vrn: vrn.trim().toUpperCase(),
          // Show "No data available" placeholders
        });
      }
      
      setHasLookedUp(true);
    } catch (error: any) {
      console.error('DVLA lookup error:', error);
      setLookupError(error.message || 'Failed to lookup vehicle data');
      setDvlaData({
        vrn: vrn.trim().toUpperCase(),
        // Show "No data available" placeholders
      });
      setHasLookedUp(true);
    } finally {
      setIsLookingUp(false);
    }
  };

  // Create Vehicle Mutation
  const createVehicleMutation = useMutation({
    mutationFn: async (vehicleData: any) => {
      const response = await fetch('/api/vehicles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vehicleData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create vehicle');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Vehicle Added",
        description: "Vehicle has been successfully added to your assets.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      onVehicleAdded();
      handleModalStateChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add vehicle",
        variant: "destructive",
      });
    },
  });

  const handleSaveVehicle = () => {
    if (!dvlaData?.vrn) {
      toast({
        title: "Error",
        description: "Please perform DVLA lookup first",
        variant: "destructive",
      });
      return;
    }

    createVehicleMutation.mutate({
      vrn: dvlaData.vrn,
      make: dvlaData.make || null,
      model: dvlaData.model || null,
      yearOfManufacture: dvlaData.yearOfManufacture || null,
      fuelType: dvlaData.fuelType || null,
      colour: dvlaData.colour || null,
      taxStatus: dvlaData.taxStatus || null,
      taxDueDate: dvlaData.taxDueDate || null,
      motStatus: dvlaData.motStatus || null,
      motExpiryDate: dvlaData.motExpiryDate || null,
      co2Emissions: dvlaData.co2Emissions || null,
      euroStatus: dvlaData.euroStatus || null,
      engineCapacity: dvlaData.engineCapacity || null,
      // revenueWeight field not available in DVLA data
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleModalStateChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Add Vehicle
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* VRN Input and Lookup */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="vrn">Vehicle Registration Number (VRN)</Label>
              <div className="flex flex-col sm:flex-row gap-2 mt-1">
                <Input
                  id="vrn"
                  value={vrn}
                  onChange={(e) => setVrn(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123"
                  disabled={hasLookedUp}
                  className="flex-1"
                />
                <Button
                  onClick={handleDVLALookup}
                  disabled={isLookingUp || hasLookedUp}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto px-4"
                >
                  {isLookingUp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="text-sm">{isLookingUp ? 'Looking up...' : 'Lookup'}</span>
                </Button>
              </div>
            </div>

            {/* Lookup Error */}
            {lookupError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{lookupError}</AlertDescription>
              </Alert>
            )}

            {/* Success Message */}
            {hasLookedUp && dvlaData && !lookupError && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>DVLA data retrieved successfully</AlertDescription>
              </Alert>
            )}
          </div>

          {/* DVLA Data Display (Read-only) */}
          {dvlaData && (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-white">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900">
                  <FileText className="h-5 w-5 text-blue-600" />
                  DVLA Vehicle Information (Read-only)
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <Label className="text-gray-600">Make</Label>
                    <p className="font-medium">{dvlaData.make || 'No data available'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Model</Label>
                    <p className="font-medium">{dvlaData.model || 'No data available'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Year</Label>
                    <p className="font-medium">{dvlaData.yearOfManufacture || 'No data available'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Fuel Type</Label>
                    <p className="font-medium">{dvlaData.fuelType || 'No data available'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Colour</Label>
                    <p className="font-medium">{dvlaData.colour || 'No data available'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Tax Status</Label>
                    <p className="font-medium">{dvlaData.taxStatus || 'No data available'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Tax Due Date</Label>
                    <p className="font-medium">
                      {dvlaData.taxDueDate ? new Date(dvlaData.taxDueDate).toLocaleDateString() : 'No data available'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-gray-600">MOT Status</Label>
                    <p className="font-medium">{dvlaData.motStatus || 'No data available'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">MOT Expiry</Label>
                    <p className="font-medium">
                      {dvlaData.motExpiryDate ? new Date(dvlaData.motExpiryDate).toLocaleDateString() : 'No data available'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-gray-600">CO2 Emissions</Label>
                    <p className="font-medium">
                      {dvlaData.co2Emissions ? `${dvlaData.co2Emissions}g/km` : 'No data available'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes Input (Editable) */}
              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any personal notes about this vehicle..."
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 mt-6">
            {hasLookedUp && (
              <Button
                onClick={() => {
                  setHasLookedUp(false);
                  setDvlaData(null);
                  setLookupError(null);
                }}
                variant="outline"
                className="w-full"
              >
                Lookup Different Vehicle
              </Button>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button 
                variant="outline" 
                onClick={() => handleModalStateChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveVehicle}
                disabled={!dvlaData || createVehicleMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2"
              >
                {createVehicleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {createVehicleMutation.isPending ? 'Adding...' : 'Add Vehicle'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Vehicle Detail Modal Component (TICKET 7)
function VehicleDetailModal({ vehicle, isOpen, onClose }: {
  vehicle: Vehicle | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Update notes when vehicle changes
  useEffect(() => {
    if (vehicle) {
      setNotes(vehicle.notes || '');
      setIsEditing(false);
    }
  }, [vehicle]);

  // Update Vehicle Notes Mutation
  const updateVehicleMutation = useMutation({
    mutationFn: async (updatedNotes: string) => {
      if (!vehicle) throw new Error('No vehicle selected');
      
      const response = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: updatedNotes.trim() || null }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update vehicle');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Vehicle Updated",
        description: "Notes have been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vehicle notes",
        variant: "destructive",
      });
    },
  });

  // TICKET 8: Refresh DVLA Data Mutation
  const refreshDvlaMutation = useMutation({
    mutationFn: async () => {
      if (!vehicle) throw new Error('No vehicle selected');
      
      const response = await fetch(`/api/vehicles/${vehicle.id}/refresh-dvla`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to refresh DVLA data');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "DVLA Data Refreshed",
        description: data.message || "Vehicle information has been updated from DVLA.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      setRefreshError(null);
    },
    onError: (error: any) => {
      const errorMessage = error.message || "Failed to refresh DVLA data";
      setRefreshError(errorMessage);
      toast({
        title: "DVLA Refresh Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSaveNotes = () => {
    updateVehicleMutation.mutate(notes);
  };

  const handleCancelEdit = () => {
    setNotes(vehicle?.notes || '');
    setIsEditing(false);
  };

  const handleRefreshDvla = () => {
    setRefreshError(null);
    refreshDvlaMutation.mutate();
  };

  if (!vehicle) return null;

  const taxDisplay = getStatusDisplay(vehicle.taxStatus, vehicle.taxDueDate);
  const motDisplay = getStatusDisplay(vehicle.motStatus, vehicle.motExpiryDate);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Vehicle Details - {vehicle.vrn}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 w-full">
          {/* Vehicle Header */}
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden">
              <h2 className="text-xl font-semibold break-words">{vehicle.vrn}</h2>
              {vehicle.make && (
                <p className="text-gray-600 text-sm sm:text-base break-words overflow-wrap-anywhere">
                  {vehicle.make} {vehicle.model} {vehicle.yearOfManufacture && `(${vehicle.yearOfManufacture})`}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {vehicle.source === 'dvla' && (
                <Badge variant="secondary" className="text-xs">DVLA Verified</Badge>
              )}
              {vehicle.dvlaLastRefreshed && (
                <Badge variant="outline" className="flex items-center gap-1 text-xs">
                  <Clock className="h-3 w-3" />
                  Updated {new Date(vehicle.dvlaLastRefreshed).toLocaleDateString()}
                </Badge>
              )}
            </div>
          </div>

          {/* DVLA Data (Read-only) */}
          <div className="bg-white rounded-lg border p-3">
            <div className="flex flex-col gap-2 mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-center">
                <FileText className="h-4 w-4 text-blue-600" />
                DVLA Vehicle Information
              </h3>
              {/* TICKET 8: Refresh DVLA Data Button */}
              {vehicle.source === 'dvla' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshDvla}
                  disabled={refreshDvlaMutation.isPending}
                  className="flex items-center justify-center gap-2 w-full text-xs"
                >
                  {refreshDvlaMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {refreshDvlaMutation.isPending ? 'Refreshing...' : 'Refresh Data'}
                </Button>
              )}

              {/* TICKET 8: Show refresh errors inline */}
              {refreshError && (
                <Alert className="mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-red-600 text-xs">
                    {refreshError}
                  </AlertDescription>
                </Alert>
              )}
            </div>
            
            <div className="space-y-3 text-xs">
              <div className="space-y-2">
                <div>
                  <Label className="text-gray-600 block">Make</Label>
                  <p className="font-medium text-gray-900 break-words">{vehicle.make || 'No data available'}</p>
                </div>
                <div>
                  <Label className="text-gray-600 block">Model</Label>
                  <p className="font-medium text-gray-900 break-words">{vehicle.model || 'No data available'}</p>
                </div>
                <div>
                  <Label className="text-gray-600 block">Year</Label>
                  <p className="font-medium text-gray-900">{vehicle.yearOfManufacture || 'No data available'}</p>
                </div>
                <div>
                  <Label className="text-gray-600 block">Fuel Type</Label>
                  <p className="font-medium text-gray-900 break-words">{vehicle.fuelType || 'No data available'}</p>
                </div>
                <div>
                  <Label className="text-gray-600 block">Colour</Label>
                  <p className="font-medium text-gray-900 break-words">{vehicle.colour || 'No data available'}</p>
                </div>
                <div>
                  <Label className="text-gray-600 block">Engine Capacity</Label>
                  <p className="font-medium text-gray-900">
                    {vehicle.engineCapacity ? `${vehicle.engineCapacity}cc` : 'No data available'}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-600 block">CO2 Emissions</Label>
                  <p className="font-medium text-gray-900">
                    {vehicle.co2Emissions ? `${vehicle.co2Emissions}g/km` : 'No data available'}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-600 block">Euro Status</Label>
                  <p className="font-medium text-gray-900 break-words">{vehicle.euroStatus || 'No data available'}</p>
                </div>
                <div>
                  <Label className="text-gray-600 block">Revenue Weight</Label>
                  <p className="font-medium text-gray-900">
                    {vehicle.revenueWeight ? `${vehicle.revenueWeight}kg` : 'No data available'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tax and MOT Status */}
          <div className="space-y-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Tax Status</span>
                </div>
                <p className={`${taxDisplay.color} font-medium`}>{taxDisplay.text}</p>
                {vehicle.taxDueDate && (
                  <p className="text-xs text-gray-500 mt-1">
                    Due: {new Date(vehicle.taxDueDate).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">MOT Status</span>
                </div>
                <p className={`${motDisplay.color} font-medium`}>{motDisplay.text}</p>
                {vehicle.motExpiryDate && (
                  <p className="text-xs text-gray-500 mt-1">
                    Expires: {new Date(vehicle.motExpiryDate).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Notes (Editable) */}
          <div className="border rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h3 className="font-medium flex items-center gap-2">
                <Edit className="h-4 w-4" />
                Personal Notes
              </h3>
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 w-full sm:w-auto"
                >
                  <Edit className="h-3 w-3" />
                  Edit
                </Button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add personal notes about this vehicle..."
                  className="min-h-[100px]"
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={handleSaveNotes}
                    disabled={updateVehicleMutation.isPending}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2"
                  >
                    {updateVehicleMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    {updateVehicleMutation.isPending ? 'Saving...' : 'Save Notes'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={updateVehicleMutation.isPending}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {notes ? (
                  <p className="text-gray-700 whitespace-pre-wrap">{notes}</p>
                ) : (
                  <p className="text-gray-500 italic">No notes added yet. Click "Edit" to add notes.</p>
                )}
              </div>
            )}
          </div>

          {/* DVLA Refresh Info */}
          {vehicle.dvlaLastRefreshed && (
            <div className="text-xs text-gray-500 text-center">
              DVLA data last refreshed: {new Date(vehicle.dvlaLastRefreshed).toLocaleString()}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Vehicle Edit Modal Component
function VehicleEditModal({ vehicle, isOpen, onClose, onSaved }: {
  vehicle: Vehicle | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (vehicle && isOpen) {
      setNotes(vehicle.notes || '');
    }
  }, [vehicle, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicle) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ notes }),
      });

      if (!response.ok) {
        throw new Error('Failed to update vehicle');
      }

      toast({
        title: 'Vehicle updated',
        description: 'Vehicle notes have been successfully updated.',
      });
      onSaved();
    } catch (error) {
      toast({
        title: 'Failed to update vehicle',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!vehicle) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6 mx-auto">
        <DialogHeader>
          <DialogTitle>Edit Vehicle Notes</DialogTitle>
          <p className="text-sm text-gray-600">
            {vehicle.vrn} - {vehicle.make} {vehicle.model}
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this vehicle..."
              rows={4}
              className="mt-1"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Assets Tab Content Component
function AssetsTabContent() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddVehicleModalOpen, setIsAddVehicleModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [vehicleToEdit, setVehicleToEdit] = useState<Vehicle | null>(null);
  
  // Fetch vehicles data with enhanced error handling
  const { data: vehicles, isLoading, error } = useVehicles();

  const handleAddVehicle = () => {
    setIsAddVehicleModalOpen(true);
  };

  const handleVehicleAdded = () => {
    // Modal will be closed automatically by the AddVehicleModal component
    // Vehicle list will be refreshed by React Query cache invalidation
  };

  const handleViewVehicleDetails = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedVehicle(null);
  };

  const handleEditVehicle = (vehicle: Vehicle) => {
    setVehicleToEdit(vehicle);
    setIsEditModalOpen(true);
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!confirm('Are you sure you want to delete this vehicle? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/vehicles/${vehicleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete vehicle');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      toast({
        title: 'Vehicle deleted',
        description: 'Vehicle has been successfully deleted.',
      });
    } catch (error) {
      toast({
        title: 'Failed to delete vehicle',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Vehicle Assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Vehicle Assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              {error?.type === 'auth' ? (
                <div>
                  <p className="text-blue-600 mb-4">You need to sign in to view your vehicles.</p>
                  <Button onClick={() => window.location.href = '/auth/google'}>
                    Sign In
                  </Button>
                </div>
              ) : error?.type === 'forbidden' ? (
                <div>
                  <p className="text-amber-600 mb-4">You don't have access to Vehicle Assets.</p>
                  <Button variant="outline">Contact Admin</Button>
                </div>
              ) : (
                <div>
                  <p className="text-red-600">
                    Could not load your vehicles. Please refresh or try again.
                    {error?.cid && <span className="text-xs block mt-1">Ref: {error.cid}</span>}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 px-4 sm:px-6">
      <Card>
        <CardHeader className="text-center">
          <div className="flex flex-col items-center gap-4 max-w-4xl mx-auto">
            <div className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Car className="h-5 w-5" />
                Vehicle Assets
              </CardTitle>
              <p className="text-sm text-gray-600 mt-2 max-w-2xl mx-auto">
                Manage your vehicles, track MOT and tax expiry dates, and get AI-powered compliance insights.
              </p>
            </div>
            <Button onClick={handleAddVehicle} className="flex items-center gap-2 w-full sm:w-auto max-w-xs">
              <Plus className="h-4 w-4" />
              Add Vehicle
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!vehicles || vehicles.length === 0 ? (
            <div className="text-center py-12 max-w-lg mx-auto">
              <Car className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles added yet</h3>
              <p className="text-gray-600 mb-6 text-sm sm:text-base px-4">
                Add your first vehicle to track tax, MOT, and get compliance reminders.
              </p>
              <Button onClick={handleAddVehicle} className="flex items-center gap-2 mx-auto w-full sm:w-auto max-w-xs">
                <Plus className="h-4 w-4" />
                Add Your First Vehicle
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 place-items-center w-full max-w-4xl mx-auto px-2">
              {vehicles.map((vehicle) => (
                <VehicleCard 
                  key={vehicle.id} 
                  vehicle={vehicle} 
                  onViewDetails={handleViewVehicleDetails}
                  onEdit={handleEditVehicle}
                  onDelete={handleDeleteVehicle}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Vehicle Modal */}
      <AddVehicleModal
        isOpen={isAddVehicleModalOpen}
        onClose={() => setIsAddVehicleModalOpen(false)}
        onVehicleAdded={handleVehicleAdded}
      />

      {/* Vehicle Detail Modal */}
      <VehicleDetailModal
        vehicle={selectedVehicle}
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
      />

      {/* Edit Vehicle Modal */}
      <VehicleEditModal
        vehicle={vehicleToEdit}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setVehicleToEdit(null);
        }}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
          setIsEditModalOpen(false);
          setVehicleToEdit(null);
        }}
      />
    </div>
  );
}

export default function Settings() {
  const { user, isAuthenticated, isLoading } = useAuth();
  // Get subscription status for proper premium detection
  const { data: subscriptionStatus } = useQuery<{
    tier: string;
    status: string;
    renewalDate?: string;
  }>({
    queryKey: ["/api/stripe/subscription-status"],
    enabled: isAuthenticated,
  });
  
  const isPremium = subscriptionStatus?.tier === 'premium' && subscriptionStatus?.status === 'active';
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");



  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const getInitials = (firstName?: string, lastName?: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) return firstName[0].toUpperCase();
    if ((user as any)?.email) return (user as any).email[0].toUpperCase();
    return "U";
  };

  const getDisplayName = () => {
    if ((user as any)?.firstName && (user as any)?.lastName) {
      return `${(user as any).firstName} ${(user as any).lastName}`;
    }
    if ((user as any)?.firstName) return (user as any).firstName;
    return (user as any)?.email || "User";
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include'
      });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
    }
  };



  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF4EF]">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20 md:pb-8">
        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <SettingsIcon className="h-6 w-6 text-[#1E90FF]" />
            <h1 className="text-2xl font-bold text-[#2B2F40]">Settings</h1>
          </div>
          <p className="text-sm text-gray-600">Manage your account and preferences</p>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-1 h-auto p-1">
            <TabsTrigger value="profile" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
              <User className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Profile</span>
              <span className="sm:hidden">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="assets" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
              <Car className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Vehicles</span>
              <span className="sm:hidden">Vehicles</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
              <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Account</span>
              <span className="sm:hidden">Account</span>
            </TabsTrigger>
            <TabsTrigger value="shared-access" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Shared Access</span>
              <span className="sm:hidden">Share</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
              <Bell className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Notifications</span>
              <span className="sm:hidden">Notify</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
              <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Security</span>
              <span className="sm:hidden">Security</span>
            </TabsTrigger>
            <TabsTrigger value="support" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
              <HelpCircle className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Support</span>
              <span className="sm:hidden">Support</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={(user as any)?.profileImageUrl} alt="Profile" />
                    <AvatarFallback className="text-lg">
                      {getInitials((user as any)?.firstName, (user as any)?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 space-y-2">
                    <div>
                      <h3 className="text-lg font-semibold">{getDisplayName()}</h3>
                      <p className="text-gray-600">{(user as any)?.email}</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <Badge variant="secondary">Verified Account</Badge>
                      {isPremium ? (
                        <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white">
                          <Crown className="h-3 w-3 mr-1" />
                          Premium Plan
                        </Badge>
                      ) : (
                        <Badge variant="outline">Free Plan</Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-500">
                      Member since {(user as any)?.createdAt ? new Date((user as any).createdAt).toLocaleDateString('en-US', { 
                        month: 'long', 
                        year: 'numeric' 
                      }) : 'Recently'}
                    </p>
                  </div>
                  
                  <Button variant="outline" size="sm">
                    Edit Profile
                  </Button>
                </div>
            </CardContent>
          </Card>

            {/* Account Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Account Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium text-gray-900">Sign Out</h4>
                    <p className="text-sm text-gray-600">Sign out of your account and return to the homepage</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                    data-testid="button-logout"
                  >
                    <LogOut className="h-4 w-4" />
                    Log Out
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Category Management Section */}
            <CategoryManagement />

            {/* Your Assets Section */}
            <YourAssetsSection />


          </TabsContent>

          {/* Assets Tab */}
          <TabsContent value="assets" className="space-y-6">
            <AssetsTabContent />
          </TabsContent>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-6">
            {isPremium && (
              <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <Crown className="h-5 w-5" />
                    Premium Active
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-green-700 dark:text-green-300">
                  You have full access to all premium features including unlimited documents and AI analysis.
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Subscription & Billing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SubscriptionPlans />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Shared Access Tab */}
          <TabsContent value="shared-access" className="space-y-6">
            <SharedAccessManagement />
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Document Expiry Alerts</h4>
                    <p className="text-sm text-gray-600">Get notified when documents are expiring</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Email Processing Updates</h4>
                    <p className="text-sm text-gray-600">Notifications when emails are processed</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Sharing Notifications</h4>
                    <p className="text-sm text-gray-600">When documents are shared with you</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security & Privacy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Account Security</h4>
                    <p className="text-sm text-gray-600">Manage your sign-in methods and security</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Data Export</h4>
                    <p className="text-sm text-gray-600">Download all your documents and data</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Export
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Delete Account</h4>
                    <p className="text-sm text-gray-600">Permanently delete your account and data</p>
                  </div>
                  <Button variant="destructive" size="sm">
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Support Tab */}
          <TabsContent value="support" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  Help & Support
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Documentation</h4>
                    <p className="text-sm text-gray-600">Learn how to use MyHome effectively</p>
                  </div>
                  <Button variant="outline" size="sm">
                    View Docs
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Contact Support</h4>
                    <p className="text-sm text-gray-600">Get help with any issues or questions</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Contact Us
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Feature Requests</h4>
                    <p className="text-sm text-gray-600">Suggest improvements or new features</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Submit Idea
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

    </div>
  );
}