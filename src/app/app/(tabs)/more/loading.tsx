import {
  ScreenSkeleton, TitleSkeleton, SectionSkeleton, ListSkeleton,
} from '@/components/app/Skeletons';

/** More: three grouped sections rather than one long list. */
export default function Loading() {
  return (
    <ScreenSkeleton>
      <TitleSkeleton />
      <div className="wrap stack-lg">
        <div><SectionSkeleton /><ListSkeleton rows={4} thumb /></div>
        <div><SectionSkeleton /><ListSkeleton rows={3} thumb /></div>
        <div><SectionSkeleton /><ListSkeleton rows={2} /></div>
      </div>
    </ScreenSkeleton>
  );
}
