import * as React from "react";

/**
 * Minimal tooltip shim to satisfy imports during build.
 * Replace later with a real tooltip (e.g., shadcn/ui or Radix).
 */

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  return <span className="group relative inline-block">{children}</span>;
}

export function TooltipTrigger({ children }: { children: React.ReactNode }) {
  return <span className="inline-block">{children}</span>;
}

export function TooltipContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="pointer-events-none absolute z-50 hidden group-hover:inline-block -translate-y-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 shadow">
      {children}
    </span>
  );
}