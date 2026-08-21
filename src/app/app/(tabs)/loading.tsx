import {
  ScreenSkeleton, TitleSkeleton, SectionSkeleton, ListSkeleton,
} from '@/components/app/Skeletons';

/** Today: greeting, the pulse card, the money lines, work, recent orders. */
export default function Loading() {
  return (
    <ScreenSkeleton>
      <TitleSkeleton />
      <div className="wrap stack-lg">
        {/* Matches the pulse card's real height — figure, delta, 92px plot and
            the day labels — so nothing shifts when the data lands. */}
        <div className="pulse" aria-hidden="true">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.8rem' }}>
            <div style={{ flex: 1 }}>
              <span className="sk" style={{ display: 'block', height: 9, width: '46%' }} />
              <span className="sk" style={{ display: 'block', height: 30, width: '62%', marginTop: 10 }} />
            </div>
            <span className="sk" style={{ width: 148, height: 34, borderRadius: 11, flex: 'none' }} />
          </div>
          <span className="sk" style={{ display: 'block', height: 11, width: '40%', marginTop: 12 }} />
          <span className="sk" style={{ display: 'block', height: 92, marginTop: 10, borderRadius: 8 }} />
        </div>
        <ListSkeleton rows={2} />
        <div><SectionSkeleton /><ListSkeleton rows={2} /></div>
        <div><SectionSkeleton /><ListSkeleton rows={5} /></div>
      </div>
    </ScreenSkeleton>
  );
}
