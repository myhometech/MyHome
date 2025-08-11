import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Mail, X, CalendarIcon, Filter, SortAsc, SortDesc } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface EmailSearchFiltersProps {
  onFiltersChange: (filters: EmailFilters) => void;
  onSortChange: (sort: string) => void;
  activeFilters: EmailFilters;
  activeSort?: string;
}

interface EmailFilters {
  source?: 'email';
  'email.subject'?: string;
  'email.from'?: string;
  'email.receivedAt'?: {
    gte?: string;
    lte?: string;
  };
}

const EmailSearchFilters: React.FC<EmailSearchFiltersProps> = ({
  onFiltersChange,
  onSortChange,
  activeFilters,
  activeSort
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localFilters, setLocalFilters] = useState<EmailFilters>(activeFilters);
  const [fromDate, setFromDate] = useState<Date | undefined>(
    activeFilters['email.receivedAt']?.gte ? new Date(activeFilters['email.receivedAt'].gte) : undefined
  );
  const [toDate, setToDate] = useState<Date | undefined>(
    activeFilters['email.receivedAt']?.lte ? new Date(activeFilters['email.receivedAt'].lte) : undefined
  );

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...localFilters };
    
    if (key === 'source') {
      if (value === 'all') {
        delete newFilters.source;
      } else {
        newFilters.source = value;
      }
    } else if (key === 'email.subject' || key === 'email.from') {
      if (value.trim() === '') {
        delete newFilters[key];
      } else {
        newFilters[key] = value;
      }
    } else if (key === 'email.receivedAt.gte') {
      if (!newFilters['email.receivedAt']) {
        newFilters['email.receivedAt'] = {};
      }
      if (value) {
        newFilters['email.receivedAt'].gte = value.toISOString();
      } else {
        delete newFilters['email.receivedAt']?.gte;
        if (Object.keys(newFilters['email.receivedAt'] || {}).length === 0) {
          delete newFilters['email.receivedAt'];
        }
      }
    } else if (key === 'email.receivedAt.lte') {
      if (!newFilters['email.receivedAt']) {
        newFilters['email.receivedAt'] = {};
      }
      if (value) {
        // Set to end of day
        const endOfDay = new Date(value);
        endOfDay.setHours(23, 59, 59, 999);
        newFilters['email.receivedAt'].lte = endOfDay.toISOString();
      } else {
        delete newFilters['email.receivedAt']?.lte;
        if (Object.keys(newFilters['email.receivedAt'] || {}).length === 0) {
          delete newFilters['email.receivedAt'];
        }
      }
    }
    
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);

    // Analytics
    console.log(`📊 search_filter_applied: key=${key}, hasValue=${!!value}`);
  };

  const handleSortChange = (sort: string) => {
    onSortChange(sort);
    console.log(`📊 search_sorted: field=${sort.split(':')[0]}, order=${sort.split(':')[1]}`);
  };

  const clearAllFilters = () => {
    setLocalFilters({});
    setFromDate(undefined);
    setToDate(undefined);
    onFiltersChange({});
    onSortChange('uploadedAt:desc');
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (localFilters.source) count++;
    if (localFilters['email.subject']) count++;
    if (localFilters['email.from']) count++;
    if (localFilters['email.receivedAt']) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className="space-y-3">
      {/* Filter Toggle & Sort */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2"
        >
          <Filter className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        <Select value={activeSort || 'uploadedAt:desc'} onValueChange={handleSortChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="uploadedAt:desc">
              <div className="flex items-center gap-2">
                <SortDesc className="w-4 h-4" />
                Upload Date (newest)
              </div>
            </SelectItem>
            <SelectItem value="uploadedAt:asc">
              <div className="flex items-center gap-2">
                <SortAsc className="w-4 h-4" />
                Upload Date (oldest)
              </div>
            </SelectItem>
            <SelectItem value="email.receivedAt:desc">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <SortDesc className="w-4 h-4" />
                Email Received (newest)
              </div>
            </SelectItem>
            <SelectItem value="email.receivedAt:asc">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <SortAsc className="w-4 h-4" />
                Email Received (oldest)
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Clear all
          </Button>
        )}
      </div>

      {/* Filter Panel */}
      {isExpanded && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Source Filter */}
              <div>
                <Label htmlFor="source-filter" className="text-sm font-medium">
                  Source
                </Label>
                <Select
                  value={localFilters.source || 'all'}
                  onValueChange={(value) => handleFilterChange('source', value)}
                >
                  <SelectTrigger id="source-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="email">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email Only
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Email From Filter */}
              <div>
                <Label htmlFor="email-from" className="text-sm font-medium">
                  From
                </Label>
                <Input
                  id="email-from"
                  placeholder="sender@domain.com"
                  value={localFilters['email.from'] || ''}
                  onChange={(e) => handleFilterChange('email.from', e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Email Subject Filter */}
              <div>
                <Label htmlFor="email-subject" className="text-sm font-medium">
                  Subject
                </Label>
                <Input
                  id="email-subject"
                  placeholder="order confirmation"
                  value={localFilters['email.subject'] || ''}
                  onChange={(e) => handleFilterChange('email.subject', e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Date Range */}
              <div>
                <Label className="text-sm font-medium">Received Date</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal text-xs",
                          !fromDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {fromDate ? format(fromDate, "MMM d") : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={fromDate}
                        onSelect={(date) => {
                          setFromDate(date);
                          handleFilterChange('email.receivedAt.gte', date);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal text-xs",
                          !toDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {toDate ? format(toDate, "MMM d") : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={toDate}
                        onSelect={(date) => {
                          setToDate(date);
                          handleFilterChange('email.receivedAt.lte', date);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* Active Filters Display */}
            {activeFilterCount > 0 && (
              <div className="pt-3 border-t">
                <div className="flex flex-wrap gap-2">
                  {localFilters.source && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      Email Only
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() => handleFilterChange('source', 'all')}
                      />
                    </Badge>
                  )}
                  {localFilters['email.from'] && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      From: {localFilters['email.from']}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() => handleFilterChange('email.from', '')}
                      />
                    </Badge>
                  )}
                  {localFilters['email.subject'] && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      Subject: {localFilters['email.subject']}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() => handleFilterChange('email.subject', '')}
                      />
                    </Badge>
                  )}
                  {localFilters['email.receivedAt'] && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" />
                      {fromDate && format(fromDate, 'MMM d')} - {toDate && format(toDate, 'MMM d')}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() => {
                          setFromDate(undefined);
                          setToDate(undefined);
                          handleFilterChange('email.receivedAt.gte', null);
                          handleFilterChange('email.receivedAt.lte', null);
                        }}
                      />
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EmailSearchFilters;