"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Home, Car, Plus, Trash2, CheckSquare, Square, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import AddDropdownMenu from "@/components/add-dropdown-menu";
import * as z from "zod";

const houseSchema = z.object({
  type: z.literal("house"),
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  postcode: z.string().min(1, "Postcode is required"),
});

const carSchema = z.object({
  type: z.literal("car"),
  name: z.string().min(1, "Name is required"),
  registration: z.string().min(1, "Registration is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.number().int().gte(1900).lte(new Date().getFullYear()),
  vin: z.string().optional(),
});

const assetSchema = z.discriminatedUnion("type", [houseSchema, carSchema]);

type AssetForm = z.infer<typeof assetSchema>;

export function YourAssetsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());

  const [selectedType, setSelectedType] = useState<"house" | "car">("house");

  const form = useForm<AssetForm>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      type: "house",
      name: "",
      address: "",
      postcode: "",
    },
  });

  // Watch the type field to handle dynamic form changes
  const watchedType = form.watch("type");

  // Reset form when type changes
  useEffect(() => {
    if (watchedType !== selectedType) {
      setSelectedType(watchedType);
      // Reset all fields except type and name when switching
      if (watchedType === "house") {
        form.reset({
          type: "house",
          name: form.getValues("name"),
          address: "",
          postcode: "",
        });
      } else {
        form.reset({
          type: "car",
          name: form.getValues("name"),
          registration: "",
          make: "",
          model: "",
          year: new Date().getFullYear(),
          vin: "",
        });
      }
    }
  }, [watchedType, selectedType, form]);

  const { data: legacyAssets = [], isLoading: isLoadingLegacy } = useQuery({
    queryKey: ["/api/user-assets"],
    queryFn: async () => {
      const res = await fetch("/api/user-assets");
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
  });

  // Only show legacy assets in "Your Assets" section
  const assets = legacyAssets;
  const isLoading = isLoadingLegacy;

  const addAsset = useMutation({
    mutationFn: async (data: AssetForm) => {
      const res = await fetch("/api/user-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save asset");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-assets"] });
      toast({ title: "Asset added successfully!" });
      form.reset();
      setShowForm(false);
    },
    onError: () => {
      toast({ title: "Failed to save", description: "Please try again.", variant: "destructive" });
    },
  });

  const deleteAsset = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/user-assets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete asset");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-assets"] });
      toast({ title: "Asset deleted." });
    },
    onError: () => {
      toast({ title: "Failed to delete", description: "Please try again.", variant: "destructive" });
    },
  });

  const bulkDeleteAssets = useMutation({
    mutationFn: async (ids: string[]) => {
      // For user assets, we need to call individual delete endpoints
      // since there's no bulk delete for assets yet
      await Promise.all(
        ids.map(id => fetch(`/api/user-assets/${id}`, { 
          method: "DELETE",
          credentials: 'include'
        }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-assets"] });
      setSelectedAssets(new Set());
      setBulkMode(false);
      toast({ title: "Assets deleted", description: `Successfully deleted ${selectedAssets.size} assets.` });
    },
    onError: () => {
      toast({ title: "Failed to delete assets", description: "Please try again.", variant: "destructive" });
    },
  });

  // Bulk operation handlers
  const toggleBulkMode = () => {
    setBulkMode(!bulkMode);
    setSelectedAssets(new Set());
  };

  const toggleAssetSelection = (assetId: string) => {
    const newSelection = new Set(selectedAssets);
    if (newSelection.has(assetId)) {
      newSelection.delete(assetId);
    } else {
      newSelection.add(assetId);
    }
    setSelectedAssets(newSelection);
  };

  const selectAllAssets = () => {
    const allIds = new Set<string>(assets.map((asset: any) => asset.id));
    setSelectedAssets(allIds);
  };

  const clearSelection = () => {
    setSelectedAssets(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedAssets.size === 0) return;
    bulkDeleteAssets.mutate(Array.from(selectedAssets));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          Your Assets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-between items-center">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Manage your properties and vehicles</h4>
          <div className="flex items-center gap-2">
            {assets.length > 0 && (
              <Button
                variant={bulkMode ? "default" : "outline"}
                size="sm"
                onClick={toggleBulkMode}
              >
                {bulkMode ? <X className="h-4 w-4 mr-1" /> : <CheckSquare className="h-4 w-4 mr-1" />}
                {bulkMode ? "Cancel" : "Select"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4 mr-1" /> Add Asset
            </Button>
          </div>
        </div>

        {/* Bulk operations bar */}
        {bulkMode && selectedAssets.size > 0 && (
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {selectedAssets.size} asset{selectedAssets.size !== 1 ? 's' : ''} selected
              </span>
              <Button size="sm" variant="outline" onClick={selectAllAssets}>
                Select All
              </Button>
              <Button size="sm" variant="outline" onClick={clearSelection}>
                Clear
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Selected Assets</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {selectedAssets.size} asset{selectedAssets.size !== 1 ? 's' : ''}? 
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleBulkDelete}
                      className="bg-red-600 hover:bg-red-700"
                      disabled={bulkDeleteAssets.isPending}
                    >
                      {bulkDeleteAssets.isPending ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}

        {showForm && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => addAsset.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select asset type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="house">🏠 House</SelectItem>
                        <SelectItem value="car">🚗 Car</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder={selectedType === "house" ? "e.g. Family Home" : "e.g. Ford Fiesta"} 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* House-specific fields */}
              {selectedType === "house" && (
                <>
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123 Main Street" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="postcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postcode</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. SW1A 1AA" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {/* Car-specific fields */}
              {selectedType === "car" && (
                <>
                  <FormField
                    control={form.control}
                    name="registration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. ABC 123" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="make"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Make</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Ford" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Fiesta" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Year</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="e.g. 2020" 
                            {...field}
                            min="1900"
                            max={new Date().getFullYear()}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value === "" ? undefined : parseInt(value));
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="vin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>VIN (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 1HGBH41JXMN109186" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={addAsset.isPending}>
                  {addAsset.isPending ? "Saving..." : "Save Asset"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        )}

        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading assets...</p>
          ) : assets.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-2">No assets added yet</p>
              <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add your first asset
              </Button>
            </div>
          ) : (
            assets.map((asset: any) => (
              <Card 
                key={asset.id} 
                className={`border bg-surface p-4 flex items-center justify-between cursor-pointer ${
                  bulkMode && selectedAssets.has(asset.id) ? "ring-2 ring-blue-500 bg-blue-50" : ""
                }`}
                onClick={bulkMode ? () => toggleAssetSelection(asset.id) : undefined}
              >
                <div className="flex items-center gap-3 flex-1">
                  {/* Bulk Selection Checkbox */}
                  {bulkMode && (
                    <div className="flex items-center">
                      <div className="w-5 h-5 flex items-center justify-center">
                        {selectedAssets.has(asset.id) ? (
                          <CheckSquare className="h-5 w-5 text-blue-600" />
                        ) : (
                          <Square className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {asset.type === "house" ? <Home className="h-4 w-4" /> : <Car className="h-4 w-4" />}
                      {asset.name}
                    </div>
                    {asset.type === "house" ? (
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <p>{asset.address}</p>
                        {asset.postcode && <p className="font-medium">{asset.postcode}</p>}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <p>{asset.registration && `${asset.registration} • `}{asset.make} {asset.model} {asset.year && `(${asset.year})`}</p>
                        {asset.vin && <p className="text-xs opacity-75">VIN: {asset.vin}</p>}
                      </div>
                    )}
                  </div>
                </div>
                
                {!bulkMode && (
                  <div className="flex items-center gap-2">
                    <AddDropdownMenu 
                      size="sm" 
                      variant="outline"
                      selectedAssetId={asset.id}
                      selectedAssetName={asset.name}
                      onDocumentUpload={() => {
                        console.log(`Document upload initiated for ${asset.type}: ${asset.name}`);
                      }}
                      onManualDateCreate={() => {
                        console.log(`Manual date creation initiated for ${asset.type}: ${asset.name}`);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAsset.mutate(asset.id);
                      }}
                      className="text-destructive hover:text-red-700"
                      disabled={deleteAsset.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}