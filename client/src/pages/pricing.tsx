import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Home, Crown, Lock, Zap, Shield, Users, Robot } from "lucide-react";
import { Link } from "wouter";
import { useFeatures } from "@/hooks/useFeatures";
import { getFeaturesForTier, getFeaturesByCategory, FEATURES } from "@shared/features";

const pricingTiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started with document organization",
    icon: Home,
    popular: false,
    tier: 'free' as const,
    limits: {
      documents: "50 documents",
      storage: "100MB storage", 
      categories: "8 predefined categories",
      features: "Basic features only"
    }
  },
  {
    name: "Premium",
    price: "$9.99", 
    period: "per month",
    description: "Advanced features for power users and families",
    icon: Crown,
    popular: true,
    tier: 'premium' as const,
    limits: {
      documents: "Unlimited documents",
      storage: "10GB storage",
      categories: "Custom categories + tags",
      features: "All premium features"
    }
  }
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Home className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-slate-900">MyHome</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" className="text-slate-700 hover:text-primary">
                  Home
                </Button>
              </Link>
              <Link href="/login">
                <Button className="bg-primary hover:bg-blue-700">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6">
            Choose Your
            <span className="text-primary block">Perfect Plan</span>
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Start organizing your documents today. Upgrade anytime to unlock powerful features and advanced AI capabilities.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-20">
          {pricingTiers.map((tier, index) => (
            <Card 
              key={tier.name} 
              className={`relative bg-white/70 backdrop-blur-sm border-gray-200 hover:shadow-lg transition-shadow ${tier.popular ? 'ring-2 ring-primary' : ''}`}
            >
              {tier.popular && (
                <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-primary text-white">
                  Most Popular
                </Badge>
              )}
              
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-2xl font-bold">{tier.name}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-slate-900">
                    {tier.price}
                  </span>
                  <span className="text-slate-600 ml-2">
                    {tier.period}
                  </span>
                </div>
                <CardDescription className="mt-4 text-base">
                  {tier.description}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="space-y-4 mb-8">
                  {tier.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-center gap-3">
                      {feature.included ? (
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <X className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      )}
                      <span className={`text-sm ${
                        feature.included 
                          ? 'text-slate-900' 
                          : 'text-slate-500'
                      }`}>
                        {feature.name}
                      </span>
                    </div>
                  ))}
                </div>

                {tier.name === "Free" ? (
                  <Link href="/register">
                    <Button className="w-full" variant="outline">
                      Get Started Free
                    </Button>
                  </Link>
                ) : (
                  <Button className="w-full" disabled>
                    Coming Soon
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-8">
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-6">
            <Card className="bg-white/70 backdrop-blur-sm border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg text-slate-900">Can I upgrade or downgrade at any time?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">
                  Yes! You can upgrade to Pro at any time to unlock advanced features. If you downgrade from Pro to Free, 
                  your existing documents will be preserved, but some advanced features will be limited.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg text-slate-900">What happens to my documents if I cancel?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">
                  Your documents are always safe. If you cancel your Pro subscription, your account will revert to the Free plan. 
                  You can still access all your documents, though some advanced features will be disabled.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg text-slate-900">Is my data secure?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">
                  Absolutely. We use industry-standard encryption to protect your documents both in transit and at rest. 
                  Your documents are stored securely and are only accessible by you.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg text-slate-900">Do you offer refunds?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">
                  We offer a 30-day money-back guarantee for Pro subscriptions. If you're not satisfied, 
                  contact our support team for a full refund within 30 days of your purchase.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-20 text-center">
          <Card className="bg-white/70 backdrop-blur-sm border-gray-200 max-w-2xl mx-auto">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Ready to Get Organized?</h2>
              <p className="text-slate-600 mb-6">
                Join thousands of homeowners who trust MyHome to keep their documents organized and secure.
              </p>
              <div className="flex gap-4 justify-center">
                <Link href="/register">
                  <Button 
                    size="lg" 
                    className="bg-primary hover:bg-blue-700"
                  >
                    Start Free
                  </Button>
                </Link>
                <Link href="/login">
                  <Button 
                    variant="outline"
                    size="lg"
                  >
                    Sign In
                  </Button>
                </Link>
              </div>
              <div className="mt-4">
                <p className="text-sm text-slate-500">
                  Free forever • No credit card required • Upgrade anytime
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}