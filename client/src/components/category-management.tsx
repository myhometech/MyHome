import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Folder, Tag } from "lucide-react";

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
}

interface CategoryFormData {
  name: string;
  icon: string;
  color: string;
}

const availableIcons = [
  { icon: "fas fa-home", label: "Home" },
  { icon: "fas fa-building", label: "Building" },
  { icon: "fas fa-car", label: "Car" },
  { icon: "fas fa-bolt", label: "Utilities" },
  { icon: "fas fa-shield-alt", label: "Insurance" },
  { icon: "fas fa-calculator", label: "Taxes" },
  { icon: "fas fa-tools", label: "Maintenance" },
  { icon: "fas fa-file-contract", label: "Legal" },
  { icon: "fas fa-certificate", label: "Warranty" },
  { icon: "fas fa-receipt", label: "Receipts" },
  { icon: "fas fa-folder", label: "Folder" },
  { icon: "fas fa-key", label: "Keys" },
  { icon: "fas fa-wifi", label: "Internet" },
  { icon: "fas fa-phone", label: "Phone" },
  { icon: "fas fa-medkit", label: "Medical" },
  { icon: "fas fa-graduation-cap", label: "Education" },
];

const availableColors = [
  { color: "blue", label: "Blue" },
  { color: "green", label: "Green" },
  { color: "purple", label: "Purple" },
  { color: "orange", label: "Orange" },
  { color: "teal", label: "Teal" },
  { color: "indigo", label: "Indigo" },
  { color: "yellow", label: "Yellow" },
  { color: "red", label: "Red" },
  { color: "pink", label: "Pink" },
  { color: "gray", label: "Gray" },
];

export default function CategoryManagement() {
  const { toast } = useToast();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState<CategoryFormData>({
    name: "",
    icon: "fas fa-folder",
    color: "blue"
  });

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      const response = await apiRequest("POST", "/api/categories", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setIsCreateDialogOpen(false);
      setFormData({ name: "", icon: "fas fa-folder", color: "blue" });
      toast({
        title: "Category created",
        description: "Your new category has been created successfully.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Failed to create category",
        description: error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CategoryFormData> }) => {
      const response = await apiRequest("PATCH", `/api/categories/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setIsEditDialogOpen(false);
      setEditingCategory(null);
      setFormData({ name: "", icon: "fas fa-folder", color: "blue" });
      toast({
        title: "Category updated",
        description: "Your category has been updated successfully.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Failed to update category",
        description: error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({
        title: "Category deleted",
        description: "The category has been deleted and documents moved to uncategorized.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Failed to delete category",
        description: error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a category name.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      icon: category.icon,
      color: category.color
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingCategory || !formData.name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a category name.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ id: editingCategory.id, data: formData });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  const getColorClasses = (color: string) => {
    const colorMap: { [key: string]: string } = {
      blue: "bg-blue-100 text-blue-800 border-blue-200",
      green: "bg-green-100 text-green-800 border-green-200",
      purple: "bg-purple-100 text-purple-800 border-purple-200",
      orange: "bg-orange-100 text-orange-800 border-orange-200",
      teal: "bg-teal-100 text-teal-800 border-teal-200",
      indigo: "bg-indigo-100 text-indigo-800 border-indigo-200",
      yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
      red: "bg-red-100 text-red-800 border-red-200",
      pink: "bg-pink-100 text-pink-800 border-pink-200",
      gray: "bg-gray-100 text-gray-800 border-gray-200",
    };
    return colorMap[color] || colorMap.blue;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Category Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading categories...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Category Management
        </CardTitle>
        <p className="text-sm text-gray-600">
          Create and manage custom categories for organizing your documents
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create Category Button */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Create New Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Category Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Vacation Home, Investment Property"
                />
              </div>
              
              <div>
                <Label>Icon</Label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {availableIcons.map((iconOption) => (
                    <button
                      key={iconOption.icon}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, icon: iconOption.icon }))}
                      className={`p-3 rounded border text-center hover:bg-gray-50 ${
                        formData.icon === iconOption.icon ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <i className={`${iconOption.icon} text-lg`}></i>
                      <div className="text-xs mt-1">{iconOption.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Color</Label>
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {availableColors.map((colorOption) => (
                    <button
                      key={colorOption.color}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, color: colorOption.color }))}
                      className={`p-3 rounded border text-center hover:bg-gray-50 ${
                        formData.color === colorOption.color ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded mx-auto ${getColorClasses(colorOption.color).split(' ')[0]}`}></div>
                      <div className="text-xs mt-1">{colorOption.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleCreate} 
                  disabled={createMutation.isPending}
                  className="flex-1"
                >
                  {createMutation.isPending ? "Creating..." : "Create Category"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Categories List */}
        <div className="space-y-2">
          <h4 className="font-medium text-gray-900">Existing Categories</h4>
          {categories.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Folder className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No categories created yet</p>
              <p className="text-sm">Create your first category to get started</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {categories.map((category) => (
                <div 
                  key={category.id} 
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded ${getColorClasses(category.color)}`}>
                      <i className={`${category.icon} text-lg`}></i>
                    </div>
                    <div>
                      <div className="font-medium">{category.name}</div>
                      <Badge variant="outline" className="text-xs">
                        {category.color}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(category)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Category</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{category.name}"? All documents in this category will be moved to uncategorized. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(category.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete Category
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Category Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Category name"
                />
              </div>
              
              <div>
                <Label>Icon</Label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {availableIcons.map((iconOption) => (
                    <button
                      key={iconOption.icon}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, icon: iconOption.icon }))}
                      className={`p-3 rounded border text-center hover:bg-gray-50 ${
                        formData.icon === iconOption.icon ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <i className={`${iconOption.icon} text-lg`}></i>
                      <div className="text-xs mt-1">{iconOption.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Color</Label>
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {availableColors.map((colorOption) => (
                    <button
                      key={colorOption.color}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, color: colorOption.color }))}
                      className={`p-3 rounded border text-center hover:bg-gray-50 ${
                        formData.color === colorOption.color ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded mx-auto ${getColorClasses(colorOption.color).split(' ')[0]}`}></div>
                      <div className="text-xs mt-1">{colorOption.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleUpdate} 
                  disabled={updateMutation.isPending}
                  className="flex-1"
                >
                  {updateMutation.isPending ? "Updating..." : "Update Category"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}