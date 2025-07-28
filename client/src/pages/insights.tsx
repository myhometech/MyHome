import Header from '@/components/header';
import { AIInsightsDashboard } from '@/components/ai-insights-dashboard';

export function InsightsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery="" onSearchChange={() => {}} />
      <main className="container mx-auto px-4 py-8">
        <AIInsightsDashboard />
      </main>
    </div>
  );
}