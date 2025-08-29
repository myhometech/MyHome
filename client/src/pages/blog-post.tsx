import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, Clock, ArrowLeft, BookOpen, Share2 } from "lucide-react";
import { Link } from "wouter";
import ReactMarkdown from 'react-markdown';

export default function BlogPost() {
  const [match, params] = useRoute("/blog/:slug");
  const slug = params?.slug;

  const { data: post, isLoading, error } = useQuery({
    queryKey: [`/api/blog/posts/${slug}`],
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/">
                <div className="flex items-center space-x-2">
                  <Home className="h-8 w-8 text-purple-600" />
                  <h1 className="text-2xl font-bold text-slate-900">MyHome</h1>
                </div>
              </Link>
            </div>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-slate-600">Loading article...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/">
                <div className="flex items-center space-x-2">
                  <Home className="h-8 w-8 text-purple-600" />
                  <h1 className="text-2xl font-bold text-slate-900">MyHome</h1>
                </div>
              </Link>
            </div>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <BookOpen className="h-16 w-16 text-slate-400 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-slate-600 mb-2">Article Not Found</h1>
            <p className="text-slate-500 mb-6">The article you're looking for doesn't exist or has been removed.</p>
            <Link href="/blog">
              <Button className="bg-primary hover:bg-blue-700">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Blog
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const shareArticle = () => {
    if (navigator.share) {
      navigator.share({
        title: post.title,
        text: post.excerpt,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      // You could add a toast notification here
    }
  };

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
              <Link href="/blog">
                <Button variant="ghost" className="text-slate-700 hover:text-primary">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  All Articles
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

      {/* Article Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Card className="bg-white/70 backdrop-blur-sm border-gray-200">
          <CardContent className="p-8 md:p-12">
            {/* Article Header */}
            <div className="mb-8">
              <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{post.readTimeMinutes} min read</span>
                </div>
                <span>•</span>
                <span>{new Date(post.publishedAt).toLocaleDateString('en-UK', { 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                })}</span>
                <div className="ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={shareArticle}
                    className="text-slate-500 hover:text-primary"
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                </div>
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                {post.title}
              </h1>
              
              <p className="text-xl text-slate-600 leading-relaxed">
                {post.excerpt}
              </p>
              
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-6">
                  {post.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Article Content */}
            <div className="prose prose-lg max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-3xl font-bold text-slate-900 mt-8 mb-4">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-2xl font-bold text-slate-900 mt-6 mb-3">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xl font-semibold text-slate-900 mt-5 mb-2">{children}</h3>,
                  p: ({ children }) => <p className="text-slate-700 leading-relaxed mb-4">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1 text-slate-700">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1 text-slate-700">{children}</ol>,
                  li: ({ children }) => <li className="text-slate-700">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-primary pl-4 py-2 my-4 bg-blue-50 text-slate-700 italic">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {post.content}
              </ReactMarkdown>
            </div>

            {/* Article Footer */}
            <div className="mt-12 pt-8 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  Published on {new Date(post.publishedAt).toLocaleDateString('en-UK', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  })}
                </div>
                <div className="flex gap-2">
                  <Link href="/blog">
                    <Button variant="outline">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      More Articles
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button className="bg-primary hover:bg-blue-700">
                      Get Started Free
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}