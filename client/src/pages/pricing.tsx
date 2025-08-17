import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Users, User, Crown, Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PricingPlan {
  id: string;
  tier: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: string;
  features: {
    documents: number;
    storage: string;
    users: number;
    ai_features: boolean;
    household?: boolean;
  };
  popular?: boolean;
}

const tierIcons = {
  beginner: User,
  pro: Crown,
  duo: Users
};

const getFeatureList = (tier: string, features: any) => {
  const baseFeatures = [
    'Document upload & storage',
    'OCR text extraction',
    'Basic search',
    'Mobile camera scanner',
    'Document preview'
  ];

  const tierFeatures = {
    beginner: [
      ...baseFeatures,
      'Basic organization',
      'Email support'
    ],
    pro: [
      ...baseFeatures,
      'AI document summarization',
      'AI tag suggestions', 
      'Auto-categorization',
      'Smart reminders',
      'Email import',
      'Advanced scanner',
      'Priority support'
    ],
    duo: [
      ...baseFeatures,
      'AI document summarization',
      'AI tag suggestions',
      'Auto-categorization', 
      'Smart reminders',
      'Email import',
      'Advanced scanner',
      'Shared household workspace',
      'Invite family members',
      'Document sharing',
      'Premium support'
    ]
  };

  return tierFeatures[tier as keyof typeof tierFeatures] || baseFeatures;
};

export default function PricingPage() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch('/api/stripe/plans');
        if (!response.ok) {
          throw new Error('Failed to fetch plans');
        }
        const data = await response.json();
        setPlans(data.plans || []);
      } catch (error) {
        console.error('Error fetching plans:', error);
        toast({
          title: 'Error',
          description: 'Failed to load pricing plans. Please refresh the page.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingPlans(false);
      }
    };

    fetchPlans();
  }, [toast]);

  const handleSubscribe = async (planId: string) => {
    setIsLoading(planId);
    
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: planId,
          successUrl: `${window.location.origin}/dashboard?upgrade=success`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start checkout process. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(null);
    }
  };

  if (isLoadingPlans) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading pricing plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Choose Your Perfect Plan
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            From getting started to managing family documents, we have the right plan for you
          </p>
          <div className="flex items-center justify-center gap-2 mb-8">
            <Sparkles className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">
              30-day money-back guarantee on all plans
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => {
            const IconComponent = tierIcons[plan.tier as keyof typeof tierIcons] || User;
            const features = getFeatureList(plan.tier, plan.features);
            const formattedPrice = plan.amount ? `£${(plan.amount / 100).toFixed(2)}` : 'Custom';
            
            return (
              <Card 
                key={plan.id} 
                className={`relative h-full flex flex-col ${
                  plan.popular 
                    ? 'border-blue-500 shadow-lg scale-105' 
                    : 'border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center pb-8">
                  <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                    <IconComponent className="h-6 w-6 text-blue-600" />
                  </div>
                  <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                  <CardDescription className="text-gray-600 mt-2">
                    {plan.description}
                  </CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-gray-900">{formattedPrice}</span>
                    <span className="text-gray-600 ml-1">/{plan.interval}</span>
                  </div>
                  
                  <div className="mt-4 space-y-1 text-sm text-gray-500">
                    <div>{plan.features.documents === -1 ? 'Unlimited documents' : `${plan.features.documents} documents`}</div>
                    <div>{plan.features.storage}</div>
                    <div>{plan.features.users} user{plan.features.users > 1 ? 's' : ''}</div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button
                    className={`w-full ${
                      plan.popular
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-gray-900 hover:bg-gray-800'
                    }`}
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isLoading === plan.id}
                  >
                    {isLoading === plan.id ? 'Loading...' : 'Get Started'}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <div className="mt-16 text-center">
          <h3 className="text-2xl font-semibold mb-6">Frequently Asked Questions</h3>
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h4 className="font-semibold mb-2">Can I change plans anytime?</h4>
              <p className="text-gray-600">Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h4 className="font-semibold mb-2">How does the Duo plan work?</h4>
              <p className="text-gray-600">The Duo plan creates a shared household workspace where you can invite one family member to collaborate on document management with shared storage and features.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h4 className="font-semibold mb-2">Is there a free trial?</h4>
              <p className="text-gray-600">We offer a 30-day money-back guarantee on all paid plans, so you can try any plan risk-free.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}