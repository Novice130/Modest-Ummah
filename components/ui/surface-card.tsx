import React from 'react';
import { cn } from '@/lib/utils';

export interface SurfaceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
  clip?: boolean;
}

/**
 * SurfaceCard: The foundational white card panel on the tinted marketplace page.
 * 
 * Directly mirrors Flutter's SurfaceCard: every card surface in the app shares one
 * radius, one subtle hairline border, and one fill so all screens read as a unified
 * luxury boutique/marketplace.
 */
export function SurfaceCard({
  children,
  className,
  hoverEffect = false,
  clip = true,
  ...props
}: SurfaceCardProps) {
  return (
    <div
      className={cn(
        'bg-card text-card-foreground rounded-2xl border border-black/[0.08] dark:border-white/[0.12] shadow-xs',
        clip && 'overflow-hidden',
        hoverEffect && 'transition-all duration-300 hover:shadow-md hover:border-black/[0.14] dark:hover:border-white/[0.2]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export default SurfaceCard;
