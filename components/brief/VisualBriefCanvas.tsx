'use client';

import React from 'react';
import { KwipAnalysisResult } from '@/types/kwip';
import { YoutubeIcon } from '@/components/ui/YoutubeIcon';
import { Sparkles, CheckCircle2, BarChart2, BookOpen, Layers } from 'lucide-react';
import { prepareVisualBrief } from '@/lib/ai/prepareFormatData';

interface VisualBriefCanvasProps {
  data: KwipAnalysisResult;
  id?: string;
}

export const VisualBriefCanvas: React.FC<VisualBriefCanvasProps> = ({
  data,
  id = 'visual-brief-canvas',
}) => {
  // Prepare format-specific condensed data to strictly fit 794x1123 single A4 canvas
  const briefData = prepareVisualBrief(data);
  const styleKey = data.style || 'editorial';
  const isDark = styleKey === 'dark';

  const fontFamily =
    styleKey === 'editorial' || styleKey === 'academic'
      ? 'Georgia, Cambria, "Times New Roman", Times, serif'
      : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const maxChartVal = briefData.chartData
    ? Math.max(...briefData.chartData.map((d) => d.valueNum), 1)
    : 1;

  return (
    <div
      id={id}
      className={`w-[794px] min-h-[1123px] p-7 pb-8 bg-white text-slate-900 shadow-2xl relative border border-slate-200 select-none flex flex-col justify-between shrink-0 space-y-4 ${
        isDark ? 'bg-slate-950 text-slate-100 border-slate-800' : ''
      }`}
      style={{ fontFamily, backgroundColor: isDark ? '#020617' : '#ffffff' }}
    >
      <div className="space-y-3.5">
        {/* HEADER SECTION */}
        <header className="border-b-2 pb-3 border-slate-200 dark:border-slate-800 flex justify-between items-start shrink-0">
          <div className="space-y-1 max-w-[560px]">
            <div className="flex items-center gap-2">
              <span className="font-black tracking-tighter text-xl bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
                KWIP
              </span>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800">
                Visual Knowledge Brief
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {briefData.contentType}
              </span>
            </div>

            <h1 className="text-lg font-extrabold tracking-tight leading-tight text-slate-950 dark:text-slate-50">
              {briefData.title}
            </h1>

            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <YoutubeIcon className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {briefData.source.channelTitle}
              </span>
              <span>•</span>
              <span>{briefData.source.videoTitle}</span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-lg font-black tracking-tighter text-slate-900 dark:text-slate-100">
              KWIP
            </div>
            <div className="text-[8px] uppercase tracking-widest font-bold text-slate-400 mt-0.5">
              Visual Summary Engine
            </div>
          </div>
        </header>

        {/* CORE THESIS HERO CARD */}
        <div className="p-3.5 rounded-xl border bg-amber-50/90 border-amber-200 text-amber-950 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-100 shrink-0">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-white dark:bg-slate-900 shadow-sm text-amber-500 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-0.5">
                Core Thesis
              </span>
              <blockquote className="text-xs font-bold leading-snug">
                "{briefData.hook}"
              </blockquote>
            </div>
          </div>
        </div>

        {/* EXECUTIVE SUMMARY */}
        {briefData.executiveSummary && (
          <section className="shrink-0">
            <div className="flex items-center gap-1.5 mb-1">
              <BookOpen className="w-3.5 h-3.5 text-amber-500" />
              <h2 className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Executive Summary
              </h2>
            </div>
            <p className="text-[11.5px] leading-relaxed text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
              {briefData.executiveSummary}
            </p>
          </section>
        )}

        {/* KEY IDEAS GRID (2-COLUMN BALANCED CARDS) */}
        <section className="shrink-0">
          <div className="flex items-center justify-between mb-1.5 border-b pb-1 border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-500" />
              <h2 className="text-sm font-bold tracking-tight">
                Key Concepts ({briefData.keyIdeas.length})
              </h2>
            </div>
            <span className="text-[10px] font-medium text-slate-400">
              Core Actionable Insights
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {briefData.keyIdeas.map((idea) => (
              <div
                key={idea.number}
                className="p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 flex flex-col justify-between min-h-[110px]"
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span className="w-4 h-4 rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950 flex items-center justify-center font-extrabold text-[9px] shrink-0">
                      {idea.number}
                    </span>
                    {idea.tag && (
                      <span className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 truncate">
                        {idea.tag}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-[11.5px] mb-0.5 text-slate-950 dark:text-slate-50 leading-snug">
                    {idea.title}
                  </h3>

                  <p className="text-[10.5px] font-semibold text-slate-800 dark:text-slate-200 mb-0.5 leading-snug">
                    {idea.summary}
                  </p>
                </div>

                {idea.example && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[9.5px] text-slate-500 italic leading-snug">
                    <span className="font-bold not-italic text-slate-700 dark:text-slate-300">Ex: </span>
                    {idea.example}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* METRICS & OPTIONAL QUANTITATIVE DATA VISUALIZATION */}
        {((briefData.statistics && briefData.statistics.length > 0) || briefData.chartData) && (
          <section className="shrink-0 space-y-1.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <BarChart2 className="w-3.5 h-3.5 text-emerald-500" />
              <h3 className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Key Metrics & Quantitative Evidence
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {briefData.statistics.map((stat, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-xl border bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/40"
                >
                  <div className="text-base font-black text-emerald-600 dark:text-emerald-400">
                    {stat.value}
                  </div>
                  <div className="font-bold text-[9.5px] text-slate-900 dark:text-slate-100 leading-snug">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* OPTIONAL QUANTITATIVE CHART (SVG BAR VISUALIZATION) */}
            {briefData.chartData && briefData.chartData.length > 0 && (
              <div className="p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 block">
                  Data Comparison Visualization
                </span>
                <div className="space-y-1">
                  {briefData.chartData.map((c, i) => {
                    const barWidthPercent = Math.max(Math.min((c.valueNum / maxChartVal) * 100, 100), 15);
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex justify-between text-[9.5px] font-bold text-slate-700 dark:text-slate-300">
                          <span>{c.label}</span>
                          <span className="text-emerald-600 dark:text-emerald-400">{c.displayValue}</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${barWidthPercent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ACTIONABLE TAKEAWAYS */}
        {briefData.actionSteps && briefData.actionSteps.length > 0 && (
          <section className="p-3 rounded-xl bg-slate-950 text-white border border-slate-800 shrink-0 space-y-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <h2 className="text-[11px] font-bold">Actionable Takeaways</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {briefData.actionSteps.map((step) => (
                <div key={step.stepNumber} className="flex items-start gap-1.5 text-[10px] bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[8.5px] shrink-0 mt-0.5">
                    {step.stepNumber}
                  </span>
                  <p className="font-semibold text-slate-100 leading-snug">{step.action}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* FINAL SYNTHESIS & FOOTER AT BOTTOM */}
      <div className="shrink-0 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <div className="p-2.5 rounded-xl border bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-900 dark:to-amber-950/40 border-amber-200 dark:border-amber-900/50 text-center">
          <span className="text-[8.5px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-0.5">
            Final Synthesis
          </span>
          <p className="text-[11px] font-bold text-slate-950 dark:text-slate-100 leading-snug">
            {briefData.finalTakeaway}
          </p>
        </div>

        <footer className="flex items-center justify-between text-[10px] text-slate-400">
          <div>Source: YouTube ({briefData.source.channelTitle})</div>
          <div className="font-bold text-slate-700 dark:text-slate-300">
            Generated with <span className="text-amber-500">KWIP</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
