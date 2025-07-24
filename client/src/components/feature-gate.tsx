import { ReactNode } from "react";
import { useFeatures } from "@/hooks/useFeatures";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Crown, Lock, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { FEATURES } from "@shared/features";

interface FeatureGateProps {
  feature: keyof typeof FEATURES;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgrade?: boolean;
  hideCompletely?: boolean; // New prop to hide features completely for free users
}

export function FeatureGate({ 
  feature, 
  children, 
  fallback, 
  showUpgrade = true,
  hideCompletely = true // Default to hiding completely (user preference)
}: FeatureGateProps) {
  const { checkFeature, isFree } = useFeatures();
  const hasAccess = checkFeature(feature);
  const featureInfo = FEATURES[feature];

  if (hasAccess) {
    return <>{children}</>;
  }

  // If hideCompletely is true (user preference), don't show anything to free users
  if (hideCompletely) {
    return null;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgrade) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-lg">{featureInfo.name}</CardTitle>
            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
              <Crown className="h-3 w-3 mr-1" />
              Premium
            </Badge>
          </div>
        </div>
        <CardDescription className="text-amber-700">
          {featureInfo.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <p className="text-sm text-amber-600">
            Upgrade to Premium to unlock this feature
          </p>
          <Link href="/pricing">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700">
              Upgrade Now
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

interface PremiumFeatureProps {
  feature: keyof typeof FEATURES;
  children: ReactNode;
  className?: string;
}

export function PremiumFeature({ feature, children, className = "" }: PremiumFeatureProps) {
  const { checkFeature } = useFeatures();
  const hasAccess = checkFeature(feature);

  if (!hasAccess) {
    return (
      <div className={`relative ${className}`}>
        <div className="absolute inset-0 bg-gray-100 bg-opacity-75 backdrop-blur-sm rounded-lg z-10 flex items-center justify-center">
          <div className="text-center">
            <Lock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-medium">Premium Feature</p>
            <Link href="/pricing">
              <Button size="sm" variant="outline" className="mt-2">
                Upgrade
              </Button>
            </Link>
          </div>
        </div>
        <div className="opacity-30 pointer-events-none">
          {children}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

interface FeatureLimitAlertProps {
  current: number;
  max: number;
  item: string;
  upgradeMessage?: string;
}

export function FeatureLimitAlert({ current, max, item, upgradeMessage }: FeatureLimitAlertProps) {
  const { isFree } = useFeatures();
  const percentage = (current / max) * 100;
  
  if (!isFree || percentage < 80) {
    return null;
  }

  const isAtLimit = current >= max;

  return (
    <Alert className={isAtLimit ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}>
      <Lock className="h-4 w-4" />
      <AlertDescription>
        <div className="flex items-center justify-between">
          <div>
            <strong>
              {isAtLimit ? "Limit reached" : "Approaching limit"}: 
            </strong>{" "}
            {current} of {max} {item} used
            {upgradeMessage && (
              <div className="text-sm mt-1">{upgradeMessage}</div>
            )}
          </div>
          <Link href="/pricing">
            <Button size="sm" variant="outline">
              Upgrade
            </Button>
          </Link>
        </div>
      </AlertDescription>
    </Alert>
  );
}