import { ScreenSkeleton, TitleSkeleton, ListSkeleton } from '@/components/app/Skeletons';

export default function Loading() {
  return (
    <ScreenSkeleton>
      <TitleSkeleton />
      <div className="wrap" style={{ marginTop: '.9rem' }}>
        <ListSkeleton rows={8} />
      </div>
    </ScreenSkeleton>
  );
}
