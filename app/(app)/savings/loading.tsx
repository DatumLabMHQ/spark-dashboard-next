import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 px-4 lg:px-6"><Skeleton className="h-3 w-16" /><Skeleton className="h-7 w-72" /><Skeleton className="h-4 w-full max-w-2xl" /></div>
      <div className="flex flex-col gap-3 px-4 lg:px-6">
        <div className="flex items-end justify-between"><div className="flex flex-col gap-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-80" /></div><Skeleton className="h-8 w-56" /></div>
        <Skeleton className="h-10 rounded-lg" />
        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
      </div>
    </div>
  );
}
