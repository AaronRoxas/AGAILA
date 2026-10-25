import React from 'react';
import { landingAssets } from '../../constants/landingAssets';

interface Feature {
  title: string;
  description: string;
  image: string;
  fit: 'cover' | 'scale-down';
  backgroundColor: string;
}

export const FeaturesSection: React.FC = () => {
  const features: Feature[] = [
    {
      title: 'AI-Driven Classification',
      description: 'Utilizes Zero-Shot Classification to instantly understand and categorize environmental hazards from unstructured RSS feeds.',
      image: landingAssets.features.aiClassification,
      fit: 'cover' as const,
      backgroundColor: '',
    },
    {
      title: 'Automated Geo-NER',
      description: 'Incorporates Geo-Named Entity Recognition to automatically extract, verify, and pinpoint precise locations from text.',
      image: landingAssets.features.geoNer,
      fit: 'cover' as const,
      backgroundColor: '',
    },
    {
      title: 'Unified Command Dashboard',
      description: 'A map of screened hazard reports with source attribution and filters for local situational awareness. Automated screening does not independently confirm an event.',
      image: landingAssets.features.commandDashboard,
      fit: 'cover' as const,
      backgroundColor: '',
    },
  ];

  return (
    <section 
      className="box-border flex flex-col gap-6 sm:gap-8 items-center overflow-visible px-4 sm:px-6 lg:px-16 py-16 sm:py-24 w-full max-w-screen-xl mx-auto"
      aria-labelledby="features-heading"
    >
      <h2 
        id="features-heading"
        className="font-lato font-extrabold text-[28px] sm:text-[32px] md:text-[36px] leading-[1.2] text-foreground text-center"
      >
        The Core Components of AGAILA
      </h2>
      <ul className="box-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 items-start justify-center overflow-visible p-0 w-full list-none">
        {features.map((feature, index) => (
          <li 
            key={index}
            className="flex flex-col gap-4 sm:gap-6 items-start w-full rounded-[8px]"
          >
            <div
              className={`h-[224px] sm:h-[280px] md:h-[320px] lg:h-[350px] w-full rounded-[16px] overflow-hidden ${
                index === 2 ? 'bg-[#f0f4f7] dark:bg-muted' : 'bg-transparent'
              }`}
            >
              <img
                src={feature.image}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                style={{
                  objectPosition: 'center right',
                  objectFit: feature.fit,
                  backgroundColor: feature.backgroundColor || undefined,
                }}
              />
            </div>
            <div className="flex flex-col gap-2 items-start w-full">
              <h3 className="font-inter font-semibold text-[18px] sm:text-[20px] md:text-[22px] lg:text-[24px] leading-[1.2] tracking-[-0.48px] text-foreground">
                {feature.title}
              </h3>
              <p className="font-inter font-medium text-[14px] sm:text-[16px] md:text-[18px] leading-[1.45] tracking-[-0.09px] text-muted-foreground">
                {feature.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
