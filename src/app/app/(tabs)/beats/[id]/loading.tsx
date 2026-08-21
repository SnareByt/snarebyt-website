import {
  ScreenSkeleton, TitleSkeleton, SectionSkeleton, ListSkeleton,
} from '@/components/app/Skeletons';

/** One beat: the cover-and-price card, then availability, files, tiers. */
export default function Loading() {
  return (
    <ScreenSkeleton>
      <TitleSkeleton />
      <div className="wrap stack-lg">
        <div className="card">
          <div className="card-pad" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span className="sk" style={{ width: 78, height: 78, borderRadius: 12, flex: 'none' }} />
            <div style={{ flex: 1 }}>
              <span className="sk" style={{ display: 'block', height: 9, width: '40%' }} />
              <span className="sk" style={{ display: 'block', height: 24, width: '60%', marginTop: 10 }} />
              <span className="sk" style={{ display: 'block', height: 10, width: '72%', marginTop: 8 }} />
            </div>
          </div>
        </div>
        <div><SectionSkeleton /><ListSkeleton rows={2} /></div>
        <div><SectionSkeleton /><ListSkeleton rows={6} thumb /></div>
        <div><SectionSkeleton /><ListSkeleton rows={4} /></div>
      </div>
    </ScreenSkeleton>
  );
}
