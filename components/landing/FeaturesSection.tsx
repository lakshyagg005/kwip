import React from 'react';
import { FileText, Layers, Download, Clock, Palette, Sparkles, Shield, Zap } from 'lucide-react';

export const FeaturesSection = () => {
  const features = [
    {
      icon: FileText,
      color: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
      title: 'Visual Brief Generation',
      description: 'Turn podcasts, keynotes, and tutorials into structured executive visual briefs with thesis, core frameworks, key ideas, and real metrics.',
    },
    {
      icon: Layers,
      color: 'bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400',
      title: '6–7 Slide Social Carousels',
      description: 'Generate perfectly bounded, high-impact slide decks ready to export and publish directly to LinkedIn, Twitter, and Instagram.',
    },
    {
      icon: Download,
      color: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
      title: 'Vector PDF & High-Res PNG Exports',
      description: 'Download crisp, high-resolution PNGs or structured vector PDFs for presentations, team distribution, or personal archival.',
    },
    {
      icon: Clock,
      color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
      title: 'Up to 30-Minute Video Support',
      description: 'KWIP supports YouTube videos up to 30 minutes with transcript processing without dropping later insights or conclusions.',
    },
    {
      icon: Palette,
      color: 'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
      title: '5 Curated Visual Palettes',
      description: 'Switch seamlessly between Editorial, Minimal, Bold, Academic, and Sleek Dark themes for tailored aesthetic storytelling.',
    },
    {
      icon: Shield,
      color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400',
      title: 'Personal Knowledge Library',
      description: 'All your past analyses are automatically organized in your personal Supabase-protected library with custom delete and share controls.',
    },
  ];

  return (
    <section id="features" className="py-20 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200/60 dark:border-slate-800/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100/80 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-300 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Built for Knowledge Workers & Creators</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Everything you need to <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">distill video knowledge</span>
          </h2>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 font-medium">
            Stop taking manual notes or watching long videos on 2x speed. KWIP automates the visual synthesis pipeline.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => {
            const IconComponent = feature.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md hover:shadow-xl transition space-y-4"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${feature.color}`}>
                  <IconComponent className="w-6 h-6" />
                </div>

                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">
                  {feature.title}
                </h3>

                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
