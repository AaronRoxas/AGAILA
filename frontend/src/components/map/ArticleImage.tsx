import React, { useState } from 'react';
import { articleSourceUrl } from '../../lib/articleSource';

interface Props {
  url?: string | null;
  alt?: string | null;
  headline?: string | null;
  source?: string;
}

/** Key by URL at the call site so load/error state resets when selection changes. */
export function ArticleImage({ url, alt, headline, source }: Props) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const src = articleSourceUrl(url);
  if (!src || state === 'failed') return null;
  return (
    <figure className="space-y-2">
      <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
        {state === 'loading' && <span role="status" className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Loading article image…</span>}
        <img src={src} alt={alt || (headline ? `Article image: ${headline}` : 'Image from the original article')}
          width={640} height={360} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          className={`relative h-full w-full object-cover ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setState('ready')} onError={() => setState('failed')} />
      </div>
      {source && <figcaption className="text-xs text-muted-foreground">Article image · {source}</figcaption>}
    </figure>
  );
}
