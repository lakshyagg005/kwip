import React from 'react';
import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { InteractiveDemo } from '@/components/landing/InteractiveDemo';
import { UseCases } from '@/components/landing/UseCases';
import { FAQ } from '@/components/landing/FAQ';
import { CTA } from '@/components/landing/CTA';
import { Footer } from '@/components/landing/Footer';
import { Metadata } from 'next';

import { FeaturesSection } from '@/components/landing/FeaturesSection';

export const metadata: Metadata = {
  title: 'KWIP — Turn Long Videos Into Visual Briefs',
  description: 'KWIP turns informative YouTube videos into beautiful visual briefs, carousels, and PDFs in minutes.',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <InteractiveDemo />
        <FeaturesSection />
        <UseCases />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
