import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, FileText, Shield, Search, Camera, Cloud, BookOpen, Clock } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

export default function Landing() {
  const { data: blogPosts } = useQuery({
    queryKey: ['/api/blog/posts'],
  });

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
              <Link href="/pricing">
                <Button variant="ghost" className="text-slate-700 hover:text-primary">
                  Pricing
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

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6">
            Organize Your Home
            <span className="text-primary block">Documents Effortlessly</span>
          </h1>
          <p className="text-xl text-slate-600 mb-8 max-w-3xl mx-auto">
            Scan, store, and organize all your property-related documents in one secure place. 
            From utility bills to insurance policies, keep everything at your fingertips.
          </p>
          <div className="flex gap-4 justify-center mb-4">
            <Link href="/register">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-blue-700 text-lg px-8 py-3"
              >
                Get Started Free
              </Button>
            </Link>
            <Link href="/pricing">
              <Button 
                variant="outline"
                size="lg" 
                className="text-lg px-8 py-3"
              >
                See Pricing
              </Button>
            </Link>
          </div>
          <p className="text-slate-500">
            Free plan available • No credit card required
          </p>
        </div>

        {/* Features Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Card className="bg-white/70 backdrop-blur-sm border-gray-200 hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Camera className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Scan Documents</h3>
              <p className="text-slate-600">
                Use your phone camera to quickly scan and upload documents. No need for expensive scanners.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm border-gray-200 hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Smart Organization</h3>
              <p className="text-slate-600">
                Automatically categorize documents by type: utilities, insurance, taxes, and more.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm border-gray-200 hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Quick Search</h3>
              <p className="text-slate-600">
                Find any document instantly with powerful search across all your files and tags.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm border-gray-200 hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Secure Storage</h3>
              <p className="text-slate-600">
                Your documents are encrypted and stored securely with enterprise-grade protection.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm border-gray-200 hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <Cloud className="h-6 w-6 text-teal-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Cloud Sync</h3>
              <p className="text-slate-600">
                Access your documents from anywhere, on any device. Always up-to-date and synced.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm border-gray-200 hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <Home className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Home Focused</h3>
              <p className="text-slate-600">
                Designed specifically for homeowners to manage property-related documentation.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Blog Section */}
        <div className="mt-20">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <BookOpen className="h-8 w-8 text-primary mr-3" />
              <h2 className="text-3xl font-bold text-slate-900">Latest Insights</h2>
            </div>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Discover practical tips and insights for managing your home documents more effectively
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {(blogPosts as any[])?.slice(0, 3)?.map((post: any) => (
              <Card key={post.id} className="bg-white/70 backdrop-blur-sm border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                    <Clock className="h-4 w-4" />
                    <span>{post.readTimeMinutes} min read</span>
                  </div>
                  <CardTitle className="text-lg font-semibold text-slate-900 line-clamp-2">
                    {post.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600 mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {(post.tags as string[])?.slice(0, 2)?.map((tag: string) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <Link href={`/blog/${post.slug}`}>
                      <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700">
                        Read More →
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {blogPosts && (blogPosts as any[]).length > 3 ? (
            <div className="text-center mt-8">
              <Link href="/blog">
                <Button variant="outline" size="lg">
                  View All Articles
                </Button>
              </Link>
            </div>
          ) : null}
        </div>

        {/* CTA Section */}
        <div className="mt-20 text-center">
          <Card className="bg-white/70 backdrop-blur-sm border-gray-200 max-w-2xl mx-auto">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold mb-4">Ready to Get Organized?</h2>
              <p className="text-slate-600 mb-6">
                Join thousands of homeowners who have simplified their document management.
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
                <Link href="/pricing">
                  <Button 
                    variant="outline"
                    size="lg"
                  >
                    View Pricing
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