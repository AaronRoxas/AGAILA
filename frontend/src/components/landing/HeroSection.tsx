import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { RecentHazards } from './RecentHazards';

export const HeroSection: React.FC = () => (
  <section className="w-full bg-background" aria-labelledby="landing-heading">
    <div className="mx-auto max-w-screen-xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14 lg:px-16">
      <div className="mb-8 grid items-end gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Philippine hazard intelligence</p>
          <h1 id="landing-heading" className="max-w-2xl font-lato text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">Understand the report.<br />Locate the risk.</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">Explore geolocated hazard reports from news and communities. Review original sources alongside AI classifications to support informed local response.</p>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button asChild><Link to="/map">Explore hazard map →</Link></Button>
            <Button asChild variant="outline"><Link to="/report">Report a hazard</Link></Button>
          </div>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">For situational awareness. Follow official advisories from PAGASA, PHIVOLCS, NDRRMC and your local government.</p>
        </div>
      </div>
      <RecentHazards />
      <p className="mt-3 text-xs text-muted-foreground">Select a marker or report to explore its location. Open the full map for source details, time filters and map layers.</p>
    </div>
  </section>
);
