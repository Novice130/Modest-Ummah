import { SurfaceCard } from '@/components/ui/surface-card';

export function ProductCardSkeleton() {
  return (
    <SurfaceCard className="h-full flex flex-col bg-card">
      <div className="aspect-[4/5] w-full bg-muted/50 skeleton" />
      <div className="p-3 sm:p-3.5 space-y-2">
        <div className="h-4 w-20 bg-muted/60 rounded-[4px] skeleton" />
        <div className="h-3.5 w-full bg-muted/50 rounded-[4px] skeleton" />
        <div className="h-3 w-16 bg-muted/40 rounded-[4px] skeleton" />
      </div>
    </SurfaceCard>
  );
}

export default ProductCardSkeleton;
