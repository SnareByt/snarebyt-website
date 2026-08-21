import {
  ScreenSkeleton, TitleSkeleton, TilesSkeleton, SectionSkeleton, ListSkeleton,
} from '@/components/app/Skeletons';

/** Today: greeting, the two revenue tiles, the work list, recent orders. */
export default function Loading() {
  return (
    <ScreenSkeleton>
      <TitleSkeleton />
      <div className="wrap stack-lg">
        <div>
          <SectionSkeleton />
          <TilesSkeleton />
        </div>
        <div>
          <SectionSkeleton />
          <ListSkeleton rows={2} />
        </div>
        <div>
          <SectionSkeleton />
          <ListSkeleton rows={5} />
        </div>
      </div>
    </ScreenSkeleton>
  );
}
