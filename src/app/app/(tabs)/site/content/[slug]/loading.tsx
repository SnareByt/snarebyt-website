import {
  ScreenSkeleton, TitleSkeleton, SectionSkeleton, ListSkeleton,
} from '@/components/app/Skeletons';

export default function Loading() {
  return (
    <ScreenSkeleton>
      <TitleSkeleton />
      <div className="wrap stack-lg">
        <div><SectionSkeleton /><ListSkeleton rows={4} /></div>
        <div><SectionSkeleton /><ListSkeleton rows={2} /></div>
        <div><SectionSkeleton /><ListSkeleton rows={4} /></div>
      </div>
    </ScreenSkeleton>
  );
}
