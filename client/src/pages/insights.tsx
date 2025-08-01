import { useState } from 'react';
import Header from '@/components/header';
import { UnifiedInsightsDashboard } from '@/components/unified-insights-dashboard';

export function InsightsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <main className="container mx-auto px-4 py-8">
        <UnifiedInsightsDashboard searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      </main>
    </div>
  );
}