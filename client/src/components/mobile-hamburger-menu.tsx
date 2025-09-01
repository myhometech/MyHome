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
  User,
  MessageCircle,
  Brain // Added import for Brain icon
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useFeatures } from "@/hooks/useFeatures";
import { motion, PanInfo } from "framer-motion";

interface MobileHamburgerMenuProps {
  className?: string;
}

export function MobileHamburgerMenu({ className = "" }: MobileHamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const { hasFeature } = useFeatures();

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
      icon: MessageCircle,
      label: "💬 Chat Assistant", 
      href: "/chat",
      badge: null,
      priority: true // Always show for now
    },
    {
      icon: Settings,
      label: "Settings",
      href: "/settings",
      badge: null
    },
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
          <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
            <Link href="/insights" onClick={handleClose}>
              <motion.div 
                className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/80 hover:shadow-sm active:bg-blue-100 transition-all duration-200 cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="relative">
                  <Lightbulb className="h-6 w-6 text-blue-600" />
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs font-bold"
                  >
                    3
                  </Badge>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Insights</h3>
                  <p className="text-sm text-muted-foreground">New insights available</p>
                </div>
              </motion.div>
            </Link>
          </div>

          {/* Main Menu Items */}
          <nav className="flex-1 p-4 space-y-2">
            {menuItems.map((item) => {
              return (
                <Link key={item.href} href={item.href} onClick={handleClose}>
                  <motion.div
                    className="flex items-center space-x-3 p-3 rounded-xl hover:bg-blue-50 hover:shadow-sm active:bg-blue-100 transition-all duration-200 cursor-pointer border border-transparent hover:border-blue-200"
                    whileHover={{ x: 6, scale: 1.01 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <item.icon className="h-5 w-5 text-muted-foreground group-hover:text-blue-600 transition-colors duration-200" />
                    <span className="text-base font-semibold text-foreground group-hover:text-blue-900 transition-colors duration-200">
                      {item.label}
                    </span>
                    {item.badge && (
                      <Badge variant="secondary" className="ml-auto text-sm font-medium">
                        {item.badge}
                      </Badge>
                    )}
                  </motion.div>
                </Link>
              );
            })}
          </nav>

          {/* Profile Section - Sticky Footer */}
          <div className="sticky bottom-0 p-4 border-t bg-white">
            <Link href="/settings" onClick={handleClose}>
              <motion.div 
                className="flex items-center space-x-3 p-3 rounded-xl hover:bg-blue-50 hover:shadow-sm active:bg-blue-100 transition-all duration-200 cursor-pointer border border-transparent hover:border-blue-200"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={(user as any)?.avatarUrl || ""} alt={(user as any)?.firstName || "User"} />
                  <AvatarFallback className="bg-blue-600 text-white text-sm font-semibold">
                    {getInitials((user as any)?.firstName, (user as any)?.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-foreground truncate">
                    {(user as any)?.firstName && (user as any)?.lastName 
                      ? `${(user as any).firstName} ${(user as any).lastName}`
                      : (user as any)?.email || "User"
                    }
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {(user as any)?.email}
                  </p>
                </div>
                <div className="flex flex-col items-end space-y-1">
                  <SubscriptionBadge 
                    tier={getSubscriptionTier() as any} 
                    size="sm" 
                  />
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              </motion.div>
            </Link>
          </div>
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}