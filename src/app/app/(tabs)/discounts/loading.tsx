import { ScreenSkeleton, TitleSkeleton, ListSkeleton } from '@/components/app/Skeletons';

export default function Loading() {
  return (
    <ScreenSkeleton>
      <TitleSkeleton />
      <div className="wrap stack-lg">
        <ListSkeleton rows={4} />
      </div>
    </ScreenSkeleton>
  );
}
