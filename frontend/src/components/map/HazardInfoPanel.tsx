import React, { useEffect, useRef } from 'react';
import { X, MapPin, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { articleSourceUrl } from '../../lib/articleSource';
import { ArticleImage } from './ArticleImage';

interface PanelHazard {
  id: string;
  hazard_type: string;
  severity?: string | null;
  location_name: string;
  latitude?: number | null;
  longitude?: number | null;
  confidence_score: number;
  source_type: string;
  validated: boolean;
  validation_notes?: string | null;
  created_at: string;
  source_content?: string | null;
  source_title?: string | null;
  source_headline?: string | null;
  source_url?: string | null;
  source_published_at?: string | null;
  image_url?: string | null;
  image_source_url?: string | null;
  image_alt?: string | null;
}

interface HazardInfoPanelProps {
  hazard: PanelHazard | null;
  isOpen: boolean;
  onClose: () => void;
  onZoomTo?: (lat: number, lon: number) => void;
}

const severityStyles: Record<string, string> = {
  critical: 'border-red-600 text-red-800 dark:text-red-300',
  severe: 'border-orange-600 text-orange-800 dark:text-orange-300',
  high: 'border-orange-600 text-orange-800 dark:text-orange-300',
  moderate: 'border-amber-600 text-amber-800 dark:text-amber-300',
  medium: 'border-amber-600 text-amber-800 dark:text-amber-300',
  minor: 'border-teal-600 text-teal-800 dark:text-teal-300',
  low: 'border-teal-600 text-teal-800 dark:text-teal-300',
};

function timestamp(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(value)) + ' PHT';
}

/** Non-modal details: map controls remain available while a report is open. */
export function HazardInfoPanel({ hazard, isOpen, onClose, onZoomTo }: HazardInfoPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);

  if (!isOpen || !hazard) return null;
  const sourceUrl = articleSourceUrl(hazard.source_url);
  const publisher = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : undefined;
  const imageSource = articleSourceUrl(hazard.image_source_url) || sourceUrl;
  const imagePublisher = imageSource ? new URL(imageSource).hostname.replace(/^www\./, '') : undefined;
  const title = hazard.source_headline || hazard.source_title;
  const severity = (hazard.severity || '').toLowerCase();
  const knownSeverity = severityStyles[severity];
  const confidence = Number.isFinite(hazard.confidence_score)
    ? `${Math.round(Math.min(1, Math.max(0, hazard.confidence_score)) * 100)}%` : 'Unavailable';
  const hasCoordinates = typeof hazard.latitude === 'number' && typeof hazard.longitude === 'number' &&
    Number.isFinite(hazard.latitude) && Number.isFinite(hazard.longitude) &&
    Math.abs(hazard.latitude) <= 90 && Math.abs(hazard.longitude) <= 180;
  const automated = hazard.validation_notes?.startsWith('Auto-validated');

  return (
    <aside aria-labelledby="hazard-detail-title" className="absolute bottom-0 right-0 z-[2000] flex max-h-[75dvh] w-full flex-col border-t border-border bg-card text-card-foreground shadow-lg sm:top-0 sm:max-h-none sm:w-96 sm:border-l sm:border-t-0 lg:w-[26rem]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">AI-classified report</p>
          <h2 id="hazard-detail-title" className="text-xl font-bold capitalize leading-tight">{hazard.hazard_type.replace(/_/g, ' ')}</h2>
          <p className="mt-2 text-sm text-muted-foreground break-words">{hazard.location_name || 'Location not specified'}</p>
        </div>
        <Button ref={closeRef} variant="ghost" size="icon" onClick={onClose} aria-label="Close hazard details" className="shrink-0"><X className="h-5 w-5" aria-hidden="true" /></Button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
        <div className={cn('flex items-center gap-2 border-l-4 bg-muted/40 px-3 py-2 text-sm', knownSeverity || 'border-border text-muted-foreground')}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Severity: <strong className="capitalize">{knownSeverity ? severity : 'Not assessed'}</strong></span>
        </div>
        <ArticleImage key={hazard.image_url} url={hazard.image_url} alt={hazard.image_alt} headline={title} source={imagePublisher} />
        <section aria-label="Original source" className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Original source · {publisher || hazard.source_type.replace(/_/g, ' ')}</p>
          {title && <h3 className="break-words text-lg font-semibold leading-snug">{title}</h3>}
          {hazard.source_content ? (
            <>
              <p className="break-words text-sm leading-relaxed text-muted-foreground">{hazard.source_content.slice(0, 240)}{hazard.source_content.length > 240 ? '…' : ''}</p>
              {hazard.source_content.length > 240 && <details key={hazard.id} className="group text-sm leading-relaxed">
                <summary className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="ml-1">Read full source excerpt</span></summary>
                <p className="mt-2 whitespace-pre-line break-words text-muted-foreground">{hazard.source_content}</p>
              </details>}
            </>
          ) : <p className="text-sm text-muted-foreground">No source excerpt is available.</p>}
          <p className="text-xs leading-relaxed text-muted-foreground">Source reporting is separate from AGAILA’s automated classification.</p>
        </section>
        <dl className="divide-y divide-border border-y border-border text-sm">
          <div className="flex justify-between gap-3 py-3"><dt className="text-muted-foreground">Source type</dt><dd className="capitalize">{hazard.source_type.replace(/_/g, ' ')}</dd></div>
          {hazard.source_published_at && <div className="py-3"><dt className="text-xs text-muted-foreground">Article published</dt><dd className="mt-1">{timestamp(hazard.source_published_at)}</dd></div>}
          <div className="py-3"><dt className="text-xs text-muted-foreground">Recorded by AGAILA</dt><dd className="mt-1">{timestamp(hazard.created_at)}</dd></div>
          <div className="py-3"><dt className="text-xs text-muted-foreground">Coordinates · latitude, longitude</dt>
            <dd className="mt-1 font-mono text-xs">{hasCoordinates ? `${hazard.latitude!.toFixed(4)}, ${hazard.longitude!.toFixed(4)}` : 'Coordinates unavailable'}</dd>
          </div>
          <div className="flex justify-between gap-3 py-3"><dt className="text-muted-foreground">AI classification confidence</dt><dd className="font-semibold tabular-nums">{confidence}</dd></div>
          <div className="py-3"><dt className="text-xs text-muted-foreground">Workflow validation</dt><dd className="mt-1 font-medium">{hazard.validated ? (automated ? 'Passed automated screening' : 'Recorded as valid') : 'Pending validation'}</dd></div>
        </dl>
        <details className="text-xs leading-relaxed text-muted-foreground">
          <summary className="cursor-pointer rounded-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Understanding confidence and validation</summary>
          <p className="mt-2">Confidence measures the model’s fit to a hazard category. Even 100% confidence does not confirm that an event occurred or indicate its severity.</p>
          <p className="mt-2">Validation is an AGAILA workflow status and may be automated. It is not independent confirmation. Severity is shown only when explicitly recorded.</p>
          {hazard.validation_notes && <p className="mt-2 break-words">Validation note: {hazard.validation_notes}</p>}
        </details>
      </div>
      <footer className="shrink-0 space-y-2 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button className="w-full" disabled={!hasCoordinates || !onZoomTo} onClick={() => { if (hasCoordinates) onZoomTo?.(hazard.latitude!, hazard.longitude!); }}><MapPin className="mr-2 h-4 w-4" aria-hidden="true" />Zoom to Location</Button>
        {sourceUrl && <Button variant="outline" className="w-full" asChild><a href={sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />View Full Source<span className="sr-only"> (opens in a new tab)</span></a></Button>}
      </footer>
    </aside>
  );
}
