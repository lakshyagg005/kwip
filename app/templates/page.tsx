'use client';

import React, { useState, useEffect } from 'react';
import { HeaderNav } from '@/components/dashboard/HeaderNav';
import { TemplateStyle } from '@/types/kwip';
import { Check, Sparkles, Layers, FileText } from 'lucide-react';

export default function TemplatesPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateStyle>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('kwip_default_template') as TemplateStyle) || 'editorial';
    }
    return 'editorial';
  });

  const handleSelectTemplate = (style: TemplateStyle) => {
    setSelectedTemplate(style);
    localStorage.setItem('kwip_default_template', style);
  };

  const templates: {
    id: TemplateStyle;
    name: string;
    description: string;
    bgClass: string;
    borderClass: string;
    badgeBg: string;
    textColor: string;
    accentColor: string;
    features: string[];
  }[] = [
    {
      id: 'editorial',
      name: 'Editorial (Default)',
      description: 'Clean high-contrast editorial design with dark navy typography and warm amber accents.',
      bgClass: 'bg-white',
      borderClass: 'border-slate-200',
      badgeBg: 'bg-amber-500 text-slate-950',
      textColor: 'text-slate-900',
      accentColor: 'text-amber-600',
      features: ['High-contrast serif/sans typography', 'Ideal for long-form podcasts & interviews', 'Balanced grid layout'],
    },
    {
      id: 'minimal',
      name: 'Minimal Clean',
      description: 'Ultra-light monochromatic visual aesthetic with generous whitespace and subtle lines.',
      bgClass: 'bg-slate-50',
      borderClass: 'border-slate-300',
      badgeBg: 'bg-slate-900 text-white',
      textColor: 'text-slate-800',
      accentColor: 'text-slate-600',
      features: ['Monochromatic neutral palette', 'Perfect for tech & business breakdowns', 'Focus on essential data'],
    },
    {
      id: 'bold',
      name: 'Vibrant Bold',
      description: 'High-energy layout with vibrant gradient headers and bold callout cards.',
      bgClass: 'bg-orange-50/50',
      borderClass: 'border-orange-200',
      badgeBg: 'bg-gradient-to-r from-amber-500 to-red-500 text-white',
      textColor: 'text-slate-900',
      accentColor: 'text-orange-600',
      features: ['Gradient highlights & strong visual pop', 'Optimized for social carousels', 'Maximum visual impact'],
    },
    {
      id: 'academic',
      name: 'Academic Structured',
      description: 'Structured layout emphasizing formal frameworks, sequential logic, and empirical citations.',
      bgClass: 'bg-blue-50/40',
      borderClass: 'border-blue-200',
      badgeBg: 'bg-blue-600 text-white',
      textColor: 'text-slate-900',
      accentColor: 'text-blue-600',
      features: ['Numbered process steps', 'Designed for educational & research videos', 'Formal citation framing'],
    },
    {
      id: 'dark',
      name: 'Sleek Dark Mode',
      description: 'Modern glassmorphic dark theme with glowing neon accents and high contrast.',
      bgClass: 'bg-slate-950',
      borderClass: 'border-slate-800',
      badgeBg: 'bg-amber-400 text-slate-950',
      textColor: 'text-slate-100',
      accentColor: 'text-amber-400',
      features: ['Dark navy/slate background', 'Glowing amber accents', 'Great for tech & engineering topics'],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <HeaderNav />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-1">
            Visual Customization
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">Template Gallery</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Select your preferred visual style. The chosen template applies to all generated briefs, carousels, and PDFs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((tpl) => {
            const isSelected = selectedTemplate === tpl.id;
            return (
              <div
                key={tpl.id}
                className={`rounded-2xl border ${tpl.borderClass} ${tpl.bgClass} p-6 flex flex-col justify-between shadow-md transition relative overflow-hidden ${
                  isSelected ? 'ring-2 ring-amber-500 shadow-xl' : 'hover:shadow-lg'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-4 right-4 flex items-center gap-1 bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow">
                    <Check className="w-3 h-3" />
                    <span>Active Template</span>
                  </div>
                )}

                <div className="space-y-4">
                  <span className={`inline-block px-3 py-1 rounded-lg text-xs font-extrabold ${tpl.badgeBg}`}>
                    {tpl.name}
                  </span>

                  <p className={`text-xs ${tpl.textColor} font-medium leading-relaxed`}>
                    {tpl.description}
                  </p>

                  <ul className="space-y-1.5 pt-2">
                    {tpl.features.map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6 mt-6 border-t border-slate-200/50 dark:border-slate-800">
                  <button
                    onClick={() => handleSelectTemplate(tpl.id)}
                    className={`w-full py-2.5 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 shadow'
                        : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Selected Template</span>
                      </>
                    ) : (
                      <span>Select Template</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
