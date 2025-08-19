import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SubscriptionBadge } from "@/components/ui/subscription-badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { 
  Menu, 
  Lightbulb, 
  Bell, 
  Calendar,
  BarChart3,
  Settings,
  User
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { motion, PanInfo } from "framer-motion";

interface MobileHamburgerMenuProps {
  className?: string;
}

export function MobileHamburgerMenu({ className = "" }: MobileHamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  const handleClose = () => setIsOpen(false);

  // Handle swipe to close gesture
  const handlePanEnd = (event: any, info: PanInfo) => {
    if (info.offset.x < -100 && info.velocity.x < -500) {
      handleClose();
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) return firstName[0].toUpperCase();
    if ((user as any)?.email) return (user as any).email[0].toUpperCase();
    return "U";
  };

  // Get subscription tier for display
  const getSubscriptionTier = () => {
    if (!user) return 'free';
    const tier = (user as any)?.subscriptionTier;
    return tier === 'premium' ? 'pro' : tier || 'free';
  };

  const menuItems = [
    {
      icon: Bell,
      label: "Notifications",
      href: "/notifications",
      badge: null
    },
    {
      icon: Calendar,
      label: "Tasks & Deadlines",
      href: "/tasks",
      badge: null
    },
    {
      icon: BarChart3,
      label: "Analytics & Reports",
      href: "/analytics",
      badge: null
    },
    {
      icon: Settings,
      label: "Settings",
      href: "/settings",
      badge: null
    }
  ];

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`md:hidden ${className}`}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      
      <SheetContent 
        side="left" 
        className="w-56 p-0 flex flex-col [&~div]:bg-black/20"
      >
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex flex-col h-full"
          drag="x"
          dragConstraints={{ left: -100, right: 0 }}
          dragElastic={0.2}
          onPanEnd={handlePanEnd}
        >
          {/* Insights - Pinned at Top */}
          <div className="p-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
            <Link href="/" onClick={handleClose}>
              <motion.div 
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-white/60 transition-colors cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="relative">
                  <Lightbulb className="h-5 w-5 text-blue-600" />
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full p-0 flex items-center justify-center text-xs"
                  >
                    3
                  </Badge>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 text-sm">Insights</h3>
                  <p className="text-xs text-gray-500">New insights available</p>
                </div>
              </motion.div>
            </Link>
          </div>

          {/* Main Menu Items */}
          <nav className="flex-1 p-3 space-y-1">
            {menuItems.map((item) => (
              <Link key={item.href} href={item.href} onClick={handleClose}>
                <motion.div
                  className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <item.icon className="h-4 w-4 text-gray-600 group-hover:text-blue-600 transition-colors" />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                    {item.label}
                  </span>
                  {item.badge && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </motion.div>
              </Link>
            ))}
          </nav>

          {/* Profile Section - Sticky Footer */}
          <div className="sticky bottom-0 p-3 border-t bg-white">
            <Link href="/settings" onClick={handleClose}>
              <motion.div 
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={(user as any)?.avatarUrl || ""} alt={(user as any)?.firstName || "User"} />
                  <AvatarFallback className="bg-blue-600 text-white text-xs">
                    {getInitials((user as any)?.firstName, (user as any)?.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {(user as any)?.firstName && (user as any)?.lastName 
                      ? `${(user as any).firstName} ${(user as any).lastName}`
                      : (user as any)?.email || "User"
                    }
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {(user as any)?.email}
                  </p>
                </div>
                <div className="flex flex-col items-end space-y-1">
                  <SubscriptionBadge 
                    tier={getSubscriptionTier() as any} 
                    size="sm" 
                  />
                  <User className="h-3 w-3 text-gray-400" />
                </div>
              </motion.div>
            </Link>
          </div>
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}