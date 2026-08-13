'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Shared form-field wrapper: label association, error message wired with
 * aria-describedby, and aria-invalid on the control — the builder never
 * shows a bare red <p> without an announced link to the input.
 */
export function Field({
  label,
  htmlFor,
  error,
  className,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  className?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function fieldProps(id: string, error?: string) {
  return {
    id,
    'aria-invalid': !!error,
    'aria-describedby': error ? `${id}-error` : undefined,
  };
}
