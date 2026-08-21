import { ScreenSkeleton, TitleSkeleton, ListSkeleton } from '@/components/app/Skeletons';

/** Beats: cover art thumbnails, so the skeleton carries them too. */
export default function Loading() {
  return (
    <ScreenSkeleton>
      <TitleSkeleton />
      <div className="wrap" style={{ marginTop: '.9rem' }}>
        <ListSkeleton rows={8} thumb />
      </div>
    </ScreenSkeleton>
  );
}
