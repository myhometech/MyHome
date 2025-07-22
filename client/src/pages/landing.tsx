import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, FileText, Shield, Search, Camera, Cloud } from "lucide-react";
import { Link } from "wouter";

export default function Landing() {

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
            <Link href="/login">
              <Button className="bg-primary hover:bg-blue-700">
                Sign In
              </Button>
            </Link>
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
          <Link href="/login">
            <Button 
              size="lg" 
              className="bg-primary hover:bg-blue-700 text-lg px-8 py-3"
            >
              Get Started Free
            </Button>
          </Link>
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

        {/* CTA Section */}
        <div className="mt-20 text-center">
          <Card className="bg-white/70 backdrop-blur-sm border-gray-200 max-w-2xl mx-auto">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold mb-4">Ready to Get Organized?</h2>
              <p className="text-slate-600 mb-6">
                Join thousands of homeowners who have simplified their document management.
              </p>
              <div className="flex gap-4 justify-center">
                <Link href="/login">
                  <Button 
                    size="lg" 
                    className="bg-primary hover:bg-blue-700"
                  >
                    Sign In
                  </Button>
                </Link>
                <Link href="/register">
                  <Button 
                    variant="outline"
                    size="lg"
                  >
                    Create Account
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
