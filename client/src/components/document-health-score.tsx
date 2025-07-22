import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { 
  Trophy, 
  Star, 
  Target, 
  TrendingUp, 
  FileText, 
  Calendar, 
  Tags, 
  Users,
  Shield,
  Zap
} from "lucide-react";

interface HealthScoreData {
  totalScore: number;
  maxScore: number;
  breakdown: {
    organization: number;
    completeness: number;
    freshness: number;
    sharing: number;
    security: number;
  };
  achievements: Array<{
    id: string;
    name: string;
    description: string;
    unlocked: boolean;
    progress: number;
    icon: string;
  }>;
  tips: string[];
  level: {
    current: number;
    name: string;
    nextThreshold: number;
    progress: number;
  };
}

const LEVEL_NAMES = [
  "Document Rookie", "File Organizer", "Paper Pro", 
  "Archive Ace", "Document Master", "Organization Guru"
];

const ACHIEVEMENT_ICONS = {
  trophy: Trophy,
  star: Star,
  target: Target,
  trending: TrendingUp,
  file: FileText,
  calendar: Calendar,
  tags: Tags,
  users: Users,
  shield: Shield,
  zap: Zap
};

export default function DocumentHealthScore() {
  const { data: healthScore, isLoading } = useQuery<HealthScoreData>({
    queryKey: ["/api/documents/health-score"],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  if (isLoading || !healthScore) {
    return (
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900 border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Trophy className="h-5 w-5" />
            Document Health Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-blue-200 dark:bg-blue-800 rounded-lg"></div>
            <div className="space-y-2">
              <div className="h-4 bg-blue-200 dark:bg-blue-800 rounded w-3/4"></div>
              <div className="h-4 bg-blue-200 dark:bg-blue-800 rounded w-1/2"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const scorePercentage = (healthScore.totalScore / healthScore.maxScore) * 100;
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900 border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Trophy className="h-5 w-5" />
            Document Health Score
          </CardTitle>
          <Badge variant={getScoreBadgeVariant(scorePercentage)} className="font-bold">
            Level {healthScore.level.current}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main Score Display */}
        <div className="text-center">
          <div className={`text-4xl font-bold ${getScoreColor(scorePercentage)}`}>
            {healthScore.totalScore}
          </div>
          <div className="text-sm text-muted-foreground">
            out of {healthScore.maxScore} points
          </div>
          <div className="text-lg font-semibold text-blue-700 dark:text-blue-300 mt-1">
            {healthScore.level.name}
          </div>
        </div>

        {/* Progress to Next Level */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress to {LEVEL_NAMES[healthScore.level.current] || "Max Level"}</span>
            <span className="font-medium">
              {healthScore.totalScore}/{healthScore.level.nextThreshold}
            </span>
          </div>
          <Progress 
            value={healthScore.level.progress} 
            className="h-2 bg-blue-200 dark:bg-blue-800"
          />
        </div>

        {/* Score Breakdown */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Score Breakdown</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span>📁 Organization:</span>
              <span className="font-medium">{healthScore.breakdown.organization}/20</span>
            </div>
            <div className="flex justify-between">
              <span>✅ Completeness:</span>
              <span className="font-medium">{healthScore.breakdown.completeness}/20</span>
            </div>
            <div className="flex justify-between">
              <span>🕒 Freshness:</span>
              <span className="font-medium">{healthScore.breakdown.freshness}/20</span>
            </div>
            <div className="flex justify-between">
              <span>🤝 Sharing:</span>
              <span className="font-medium">{healthScore.breakdown.sharing}/20</span>
            </div>
            <div className="flex justify-between col-span-2">
              <span>🔒 Security:</span>
              <span className="font-medium">{healthScore.breakdown.security}/20</span>
            </div>
          </div>
        </div>

        {/* Recent Achievements */}
        {healthScore.achievements.filter(a => a.unlocked).length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Recent Achievements</div>
            <div className="flex flex-wrap gap-1">
              {healthScore.achievements
                .filter(a => a.unlocked)
                .slice(0, 3)
                .map(achievement => {
                  const IconComponent = ACHIEVEMENT_ICONS[achievement.icon as keyof typeof ACHIEVEMENT_ICONS] || Star;
                  return (
                    <Badge key={achievement.id} variant="secondary" className="text-xs">
                      <IconComponent className="h-3 w-3 mr-1" />
                      {achievement.name}
                    </Badge>
                  );
                })}
            </div>
          </div>
        )}

        {/* Tips */}
        {healthScore.tips.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-300">💡 Quick Tips</div>
            <ul className="text-xs space-y-1">
              {healthScore.tips.slice(0, 2).map((tip, index) => (
                <li key={index} className="flex items-start gap-1">
                  <span className="text-yellow-500 mt-0.5">•</span>
                  <span className="text-muted-foreground">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Call to Action */}
        <div className="text-center pt-2">
          <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
            View Detailed Analysis →
          </button>
        </div>
      </CardContent>
    </Card>
  );
}