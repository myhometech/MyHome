import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, Clock, BookOpen, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Blog() {
  const { data: blogPosts, isLoading } = useQuery({
    queryKey: ['/api/blog/posts'],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/">
                <div className="flex items-center space-x-2">
                  <Home className="h-8 w-8 text-primary" />
                  <h1 className="text-2xl font-bold text-slate-900">MyHome</h1>
                </div>
              </Link>
            </div>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-slate-600">Loading articles...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/">
              <div className="flex items-center space-x-2">
                <Home className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-slate-900">MyHome</h1>
              </div>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" className="text-slate-700 hover:text-primary">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
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

      {/* Blog Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <BookOpen className="h-10 w-10 text-primary mr-3" />
            <h1 className="text-4xl font-bold text-slate-900">MyHome Blog</h1>
          </div>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Practical insights and tips for homeowners to better manage their property documents and streamline their home organization
          </p>
        </div>

        {/* Blog Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {blogPosts?.map((post: any) => (
            <Card key={post.id} className="bg-white/70 backdrop-blur-sm border-gray-200 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                  <Clock className="h-4 w-4" />
                  <span>{post.readTimeMinutes} min read</span>
                  <span>•</span>
                  <span>{new Date(post.publishedAt).toLocaleDateString('en-UK', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  })}</span>
                </div>
                <CardTitle className="text-xl font-semibold text-slate-900 line-clamp-2">
                  {post.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 mb-4 line-clamp-4">
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {post.tags?.slice(0, 2).map((tag: string) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                    {post.tags?.length > 2 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                        +{post.tags.length - 2} more
                      </span>
                    )}
                  </div>
                  <Link href={`/blog/${post.slug}`}>
                    <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700">
                      Read Article →
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {blogPosts?.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="h-16 w-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-600 mb-2">No articles yet</h3>
            <p className="text-slate-500">Check back soon for helpful tips and insights!</p>
          </div>
        )}
      </div>
    </div>
  );
}