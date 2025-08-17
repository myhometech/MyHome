import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Users, User, Crown, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: string;
  period: string;
  icon: any;
  popular?: boolean;
  features: string[];
  limits: {
    documents: string;
    storage: string;
    users: string;
  };
}

const plans: PricingPlan[] = [
  {
    id: 'beginner',
    name: 'Beginner',
    description: 'Perfect for getting started with document management',
    price: '£2.99',
    period: '/month',
    icon: User,
    features: [
      'Document upload & storage',
      'Basic organization',
      'OCR text extraction',
      'Basic search',
      'Mobile camera scanner',
      'Document preview',
      'Email support'
    ],
    limits: {
      documents: '200 documents',
      storage: '500MB storage',
      users: '1 user'
    }
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Advanced features for serious document management',
    price: '£7.99',
    period: '/month',
    icon: Crown,
    popular: true,
    features: [
      'Everything in Beginner',
      'AI document summarization',
      'AI tag suggestions',
      'Auto-categorization',
      'Smart reminders',
      'Email import',
      'Advanced scanner',
      'Bulk operations',
      'Priority support'
    ],
    limits: {
      documents: '5,000 documents',
      storage: '5GB storage',
      users: '1 user'
    }
  },
  {
    id: 'duo',
    name: 'Duo',
    description: 'Shared workspace for families and couples',
    price: '£9.99',
    period: '/month',
    icon: Users,
    features: [
      'Everything in Pro',
      'Shared household workspace',
      'Invite family members',
      'Document sharing',
      'Collaborative organization',
      'Shared AI insights',
      'Family document management',
      'Premium support'
    ],
    limits: {
      documents: '10,000 documents',
      storage: '10GB storage',
      users: '2 users'
    }
  }
];

export default function PricingPage() {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubscribe = async (planId: string) => {
    setIsLoading(planId);
    
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: `price_${planId}`,
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
            const IconComponent = plan.icon;
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
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-600 ml-1">{plan.period}</span>
                  </div>
                  
                  <div className="mt-4 space-y-1 text-sm text-gray-500">
                    <div>{plan.limits.documents}</div>
                    <div>{plan.limits.storage}</div>
                    <div>{plan.limits.users}</div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
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