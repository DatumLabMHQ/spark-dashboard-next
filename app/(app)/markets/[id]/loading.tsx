import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 px-4 lg:px-6"><Skeleton className="h-3 w-40" /><div className="flex items-center gap-3"><Skeleton className="size-9 rounded-full" /><Skeleton className="h-7 w-56" /></div><Skeleton className="h-4 w-full max-w-2xl" /></div>
      <div className="grid gap-4 px-4 lg:grid-cols-[64%_1fr] lg:px-6">
        <div className="flex flex-col gap-4"><div className="grid grid-cols-2 gap-4 @2xl/main:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div><Skeleton className="h-[340px] rounded-xl" /><Skeleton className="h-[340px] rounded-xl" /></div>
        <div className="flex flex-col gap-4"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-80 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
      </div>
    </div>
  );
}
