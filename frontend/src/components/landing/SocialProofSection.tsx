import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { MapPinned, Rss, Sparkles } from 'lucide-react';

interface HighlightItem {
  label: string;
  description: string;
  icon: LucideIcon;
}

export const SocialProofSection: React.FC = () => {
  const highlights: HighlightItem[] = [
    {
      label: 'Multi-Source Ingestion',
      description: 'Monitors RSS feeds from GMA News, Rappler, Inquirer, and more.',
      icon: Rss,
    },
    {
      label: 'AI-Powered Classification',
      description: 'Zero-Shot model categorizes floods, earthquakes, typhoons instantly.',
      icon: Sparkles,
    },
    {
      label: 'Philippines-Wide Coverage',
      description: 'Geo-NER extracts and plots locations across all 17 regions.',
      icon: MapPinned,
    },
  ];

  return (
    <section
      className="relative w-full overflow-hidden bg-primary"
      aria-labelledby="social-proof-heading"
    >
      {/* Ambient blue depth */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-24 left-1/2 h-64 w-[min(100%,40rem)] -translate-x-1/2 rounded-full bg-gradient-to-b from-secondary/35 via-primary to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-0 h-48 w-72 translate-x-1/4 translate-y-1/3 rounded-full bg-secondary/20 blur-3xl" />
      </div>

      {/* Top accent — brand gradient */}
      <div
        className="absolute inset-x-0 top-0 z-20 h-1 bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_1px_12px_rgba(0,90,156,0.45)]"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-0 dot-grid opacity-90"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex max-w-screen-xl flex-col items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:px-16">
        <div className="flex max-w-[680px] flex-col items-center gap-4 px-4 text-center text-primary-foreground">
          <h2
            id="social-proof-heading"
            className="font-lato text-[26px] font-extrabold leading-[1.2] tracking-tight text-balance sm:text-[32px] md:text-[38px]"
          >
            A Tool Built for Responders
          </h2>
          <p className="font-lato text-[14px] leading-relaxed text-blue-100/90 sm:text-[16px] sm:leading-[1.6]">
            AGAILA is designed to meet the critical needs of Local Government Units (LGUs) and
            Disaster Risk Reduction and Management Offices (DRRMOs) across the Philippines.
          </p>
        </div>

        <ul
          aria-label="Feature highlights"
          className="grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6 lg:gap-8"
        >
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className="relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.12] to-white/[0.04] p-5 shadow-lg shadow-black/20 backdrop-blur-md sm:p-6"
              >
                <div
                  className="pointer-events-none absolute inset-x-4 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-secondary/70 to-transparent"
                  aria-hidden="true"
                />
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-secondary to-primary text-primary-foreground shadow-md ring-1 ring-white/20"
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-lato text-[15px] font-bold leading-snug text-white sm:text-[16px]">
                    {item.label}
                  </h3>
                  <p className="font-lato text-[13px] leading-[1.55] text-white sm:text-[14px]">
                    {item.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};
