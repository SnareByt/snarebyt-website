import {
  ScreenSkeleton, TitleSkeleton, TilesSkeleton, SectionSkeleton, ListSkeleton,
} from '@/components/app/Skeletons';

export default function Loading() {
  return (
    <ScreenSkeleton>
      <TitleSkeleton />
      <div className="wrap stack-lg" style={{ marginTop: '.9rem' }}>
        <TilesSkeleton />
        <div><SectionSkeleton /><ListSkeleton rows={6} /></div>
        <div><SectionSkeleton /><ListSkeleton rows={6} /></div>
      </div>
    </ScreenSkeleton>
  );
}
