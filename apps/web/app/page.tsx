'use client';

import { useState } from 'react';
import { LandingHero } from '../components/landing/hero';
import { LandingFeatures } from '../components/landing/features';
import { LandingFooter } from '../components/landing/footer';

export default function HomePage(): React.JSX.Element {
  const [heroVisible, setHeroVisible] = useState(true);

  const handleHeroDismiss = (): void => {
    setHeroVisible(false);
  };

  return (
    <main>
      {heroVisible && (
        <div
          style={{ cursor: 'pointer' }}
          onClick={handleHeroDismiss}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleHeroDismiss();
            }
          }}
        >
          <LandingHero />
        </div>
      )}
      <LandingFeatures />
      <LandingFooter />
    </main>
  );
}
