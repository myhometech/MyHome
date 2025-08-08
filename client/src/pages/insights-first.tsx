import { useState } from "react";
import Header from "@/components/header";
import { UnifiedInsightsDashboard } from "@/components/unified-insights-dashboard";

export default function InsightsFirstPage() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <UnifiedInsightsDashboard />
    </div>
  );
}