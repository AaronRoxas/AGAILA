import React, { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchValidatedHazards } from '../../services/hazardsApi';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

const RecentHazardMap = lazy(() => import('./RecentHazardMap'));

export function RecentHazards() {
  const [selectedId, setSelectedId] = useState<string>();
  const [type, setType] = useState('all');
  const { data = [], isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['hazards', 'landing', 'recent'],
    queryFn: () => fetchValidatedHazards({ limit: 8 }),
    staleTime: 60_000, refetchInterval: 60_000, retry: 1,
  });
  const filtered = data.filter(h => type === 'all' || h.hazard_type === type);
  const selected = filtered.find(h => h.id === selectedId);
  return (
    <section aria-labelledby="recent-reports-heading" className="w-full border-y border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div><h2 id="recent-reports-heading" className="font-semibold">Recent hazard reports</h2>
          <p className="mt-1 text-xs text-muted-foreground">{data.length ? `${data.length} recent ${data.length === 1 ? 'report' : 'reports'}` : 'Recent reports'} passing AGAILA screening · Updates every minute</p></div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Hazard type
          <select value={type} onChange={e => { setType(e.target.value); setSelectedId(undefined); }} className="max-w-[10rem] rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="all">All types</option>
            {Array.from(new Set(data.map(h => h.hazard_type))).sort().map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative isolate h-[320px] min-w-0 bg-muted sm:h-[420px]">
          <Suspense fallback={<div role="status" className="p-6 text-sm text-muted-foreground">Loading hazard map…</div>}>
            <RecentHazardMap hazards={filtered} selected={selected} onSelect={h => setSelectedId(h.id)} />
          </Suspense>
        </div>
        <div className="max-h-[420px] overflow-y-auto border-t border-border lg:border-l lg:border-t-0">
          {isLoading && <p role="status" className="p-5 text-sm text-muted-foreground">Loading recent reports…</p>}
          {isError && <div role="alert" className="space-y-3 p-5 text-sm"><p>Recent reports are unavailable. Try again or open the full map.</p><Button variant="outline" size="sm" onClick={() => refetch()}>Retry reports</Button></div>}
          {!isLoading && !isError && filtered.length === 0 && <p className="p-5 text-sm text-muted-foreground">No recent reports are available for this selection. This does not mean there are no hazards.</p>}
          <ul className="divide-y divide-border">
            {filtered.map(h => <li key={h.id}>
              <button type="button" aria-pressed={selectedId === h.id} onClick={() => setSelectedId(h.id)} className={cn('w-full border-l-4 p-4 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', selectedId === h.id ? 'border-primary bg-muted' : 'border-transparent')}>
                <span className="block text-xs font-semibold capitalize text-muted-foreground">{h.hazard_type.replace(/_/g, ' ')} · {h.severity || 'Severity not assessed'}</span>
                <span className="mt-1 block break-words text-sm font-semibold leading-snug">{h.source_headline || h.source_title || h.location_name}</span>
                <span className="mt-2 block text-xs text-muted-foreground">{h.location_name || 'Location not specified'}</span>
              </button>
              {selectedId === h.id && <Link className="mx-4 mb-4 inline-block text-sm font-semibold text-primary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring dark:text-foreground" to={`/map?report=${encodeURIComponent(h.id)}`}>Inspect report on full map →</Link>}
            </li>)}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <p>{dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })} PHT` : 'Awaiting report data'} · AI classifications require source review.</p>
        <Link to="/map" className="font-semibold text-foreground underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring">Full map and filters →</Link>
      </div>
    </section>
  );
}
