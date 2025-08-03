import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface HelpBubbleProps {
  title: string;
  content: string;
  characterTip?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  size?: 'sm' | 'md' | 'lg';
  trigger?: 'hover' | 'click';
}

export default function HelpBubble({
  title,
  content,
  characterTip,
  position = 'top',
  size = 'md',
  trigger = 'click'
}: HelpBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sizeClasses = {
    sm: 'w-64',
    md: 'w-80',
    lg: 'w-96'
  };

  const HelpIcon = () => (
    <div className="relative">
      <HelpCircle 
        className="h-4 w-4 text-blue-500 hover:text-blue-600 cursor-pointer transition-colors" 
      />
      {characterTip && (
        <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
      )}
    </div>
  );

  const HelpContent = () => (
    <div className={`${sizeClasses[size]} p-4`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">✨</span>
          </div>
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setIsOpen(false)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      
      <div className="space-y-3">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {content}
        </p>
        
        {characterTip && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-3 border-l-4 border-blue-400">
            <div className="flex items-start space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs">💡</span>
              </div>
              <p className="text-xs text-blue-800 dark:text-blue-200 font-medium leading-relaxed">
                <span className="font-bold">MyHome Assistant:</span> {characterTip}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (trigger === 'hover') {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
          >
            <HelpIcon />
          </div>
        </PopoverTrigger>
        <PopoverContent side={position} className="p-0 border shadow-lg">
          <HelpContent />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex">
          <HelpIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent side={position} className="p-0 border shadow-lg">
        <HelpContent />
      </PopoverContent>
    </Popover>
  );
}

// Predefined help content for common features
export const helpContent = {
  documentUpload: {
    title: "Upload Documents",
    content: "Drag and drop your documents here, or click to browse. We support PDF, images, and common document formats.",
    characterTip: "I'll automatically scan your documents and extract important information like dates, amounts, and categories to help you stay organized!"
  },
  
  aiInsights: {
    title: "AI Insights",
    content: "Your AI assistant analyzes your documents to find important dates, action items, and key information.",
    characterTip: "Think of me as your personal document detective! I read through everything and highlight what matters most for your home management."
  },
  
  manualEvents: {
    title: "Important Dates",
    content: "Add important dates like insurance renewals, maintenance schedules, or property tax deadlines.",
    characterTip: "Don't let important dates slip by! I'll help you track everything from annual insurance renewals to quarterly maintenance tasks."
  },
  
  categories: {
    title: "Document Categories",
    content: "Organize your documents into categories like Insurance, Property, Utilities, and more for easy finding.",
    characterTip: "I learn from your choices! The more you categorize, the better I get at automatically sorting your new documents."
  },
  
  search: {
    title: "Smart Search",
    content: "Search through all your documents by content, category, date, or any text inside your files.",
    characterTip: "I can find that utility bill from last March or your insurance policy details in seconds, even if you forgot where you saved it!"
  },
  
  calendar: {
    title: "Calendar View",
    content: "See all your important dates and document deadlines in a visual calendar format.",
    characterTip: "Your home management calendar shows everything in one place - from insurance renewals to maintenance schedules. Never miss an important date again!"
  },
  
  assetTracking: {
    title: "Property & Assets",
    content: "Track your house, cars, and other valuable assets with linked documents and maintenance schedules.",
    characterTip: "Keep all your property information organized! I'll help you track maintenance, warranties, and important documents for each asset."
  }
};