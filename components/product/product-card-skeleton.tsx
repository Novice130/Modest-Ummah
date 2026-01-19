export function ProductCardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="aspect-[3/4] rounded-lg bg-muted skeleton" />
      <div className="space-y-2">
        <div className="h-3 w-16 bg-muted rounded skeleton" />
        <div className="h-4 w-full bg-muted rounded skeleton" />
        <div className="h-4 w-20 bg-muted rounded skeleton" />
      </div>
    </div>
  );
}
