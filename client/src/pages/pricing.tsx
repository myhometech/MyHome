import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { Link } from "wouter";

const pricingTiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started with document organization",
    popular: false,
    features: [
      { name: "Store up to 100 documents", included: true },
      { name: "Basic document categories", included: true },
      { name: "Simple search functionality", included: true },
      { name: "Document upload & organization", included: true },
      { name: "Basic OCR text extraction", included: true },
      { name: "Web access only", included: true },
      { name: "Advanced OCR with AI summaries", included: false },
      { name: "Expiry date tracking & alerts", included: false },
      { name: "Document sharing", included: false },
      { name: "AI-powered document chat", included: false },
      { name: "Bulk operations", included: false },
      { name: "Priority support", included: false },
      { name: "API access", included: false }
    ]
  },
  {
    name: "Pro",
    price: "$9.99",
    period: "per month",
    description: "Advanced features for power users and professionals",
    popular: true,
    features: [
      { name: "Unlimited document storage", included: true },
      { name: "Advanced document categories & tags", included: true },
      { name: "Powerful search with filters", included: true },
      { name: "Document upload & organization", included: true },
      { name: "Advanced OCR with AI summaries", included: true },
      { name: "Web access + mobile app", included: true },
      { name: "Expiry date tracking & alerts", included: true },
      { name: "Document sharing with permissions", included: true },
      { name: "AI-powered document chat", included: true },
      { name: "Bulk operations & batch processing", included: true },
      { name: "Priority email support", included: true },
      { name: "API access for integrations", included: true },
      { name: "Export to multiple formats", included: true }
    ]
  }
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Start organizing your documents today. Upgrade anytime to unlock powerful features.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          {pricingTiers.map((tier, index) => (
            <Card 
              key={tier.name} 
              className={`relative ${tier.popular ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}`}
            >
              {tier.popular && (
                <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white">
                  Most Popular
                </Badge>
              )}
              
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-2xl font-bold">{tier.name}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">
                    {tier.price}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400 ml-2">
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
                          ? 'text-gray-900 dark:text-white' 
                          : 'text-gray-500 dark:text-gray-400'
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
          <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-8">
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I upgrade or downgrade at any time?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">
                  Yes! You can upgrade to Pro at any time to unlock advanced features. If you downgrade from Pro to Free, 
                  your existing documents will be preserved, but some advanced features will be limited.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What happens to my documents if I cancel?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">
                  Your documents are always safe. If you cancel your Pro subscription, your account will revert to the Free plan. 
                  You can still access all your documents, though some advanced features will be disabled.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Is my data secure?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">
                  Absolutely. We use industry-standard encryption to protect your documents both in transit and at rest. 
                  Your documents are stored securely and are only accessible by you.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Do you offer refunds?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">
                  We offer a 30-day money-back guarantee for Pro subscriptions. If you're not satisfied, 
                  contact our support team for a full refund within 30 days of your purchase.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-16">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to get organized?
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Join thousands of users who trust MyHome to keep their documents organized and secure.
          </p>
          <Link href="/register">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
              Start Free Today
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}