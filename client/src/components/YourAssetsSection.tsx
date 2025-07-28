"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Home, Car, Plus, Trash2 } from "lucide-react";
import * as z from "zod";

const assetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  type: z.enum(["house", "car"]),
});

type AssetForm = z.infer<typeof assetSchema>;

export function YourAssetsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const form = useForm<AssetForm>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: "",
      address: "",
      type: "house",
    },
  });

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["/api/user-assets"],
    queryFn: async () => {
      const res = await fetch("/api/user-assets");
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
  });

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
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> Add Asset
          </Button>
        </div>

        {showForm && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => addAsset.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <FormControl>
                      <select {...field} className="w-full border rounded px-3 py-2 bg-background">
                        <option value="house">House</option>
                        <option value="car">Car</option>
                      </select>
                    </FormControl>
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
                      <Input placeholder="e.g. Family Home or Ford Fiesta" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <Card key={asset.id} className="border bg-surface p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {asset.type === "house" ? <Home className="h-4 w-4" /> : <Car className="h-4 w-4" />}
                    {asset.name}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{asset.address}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteAsset.mutate(asset.id)}
                  className="text-destructive hover:text-red-700"
                  disabled={deleteAsset.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}