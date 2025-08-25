import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
}

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: number | null;
  onCategoryChange: (categoryId: number | null) => void;
}

export default function CategoryFilter({ categories, selectedCategory, onCategoryChange }: CategoryFilterProps) {
  const getIconClass = (icon: string) => {
    // Convert FontAwesome classes to Lucide icons or return original
    return icon || "fas fa-folder";
  };

  const getColorClass = (color: string) => {
    const colorMap: Record<string, string> = {
      blue: "text-blue-600 bg-blue-100 hover:bg-blue-200",
      green: "text-green-600 bg-green-100 hover:bg-green-200",
      purple: "text-purple-600 bg-purple-100 hover:bg-purple-200",
      orange: "text-orange-600 bg-orange-100 hover:bg-orange-200",
      teal: "text-teal-600 bg-teal-100 hover:bg-teal-200",
      indigo: "text-indigo-600 bg-indigo-100 hover:bg-indigo-200",
      yellow: "text-yellow-600 bg-yellow-100 hover:bg-yellow-200",
      gray: "text-gray-600 bg-gray-100 hover:bg-gray-200",
    };
    return colorMap[color] || colorMap.gray;
  };

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedCategory === null ? "default" : "outline"}
          size="sm"
          onClick={() => onCategoryChange(null)}
          className={selectedCategory === null ? "bg-purple-600 text-white" : ""}
        >
          All Documents
        </Button>

        {categories.map((category) => (
          <Button
            key={category.id}
            variant="outline"
            size="sm"
            onClick={() => onCategoryChange(category.id)}
            className={`${
              selectedCategory === category.id
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            } transition-colors`}
          >
            <i className={`${getIconClass(category.icon)} mr-2 text-sm`}></i>
            {category.name}
          </Button>
        ))}

        <Button
          variant="outline"
          size="sm"
          className="bg-white text-accent-purple-700 border-accent-purple-200 hover:bg-accent-purple-50 hover:border-accent-purple-300 transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Documents
        </Button>
      </div>
    </div>
  );
}