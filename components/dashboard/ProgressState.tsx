'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';

interface ProgressStage {
  id: string;
  label: string;
}

const STAGES: ProgressStage[] = [
  { id: 'metadata', label: 'Video information' },
  { id: 'transcript', label: 'Transcript & captions' },
  { id: 'content', label: 'Content understanding & key ideas' },
  { id: 'brief', label: 'Building your visual knowledge brief' },
  { id: 'assets', label: 'Preparing your carousel & PDF' },
];

interface ProgressStateProps {
  requestId?: string | null;
}

export const ProgressState: React.FC<ProgressStateProps> = ({ requestId }) => {
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [percent, setPercent] = useState(10);

  useEffect(() => {
    // Reset stage index and percentage ONCE per unique request ID
    setCurrentStageIndex(0);
    setPercent(10);

    const stageTimer = setInterval(() => {
      setCurrentStageIndex((prev) => {
        if (prev < STAGES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 4500);

    const percentTimer = setInterval(() => {
      setPercent((prev) => {
        if (prev < 92) {
          // Increment progress smoothly up to 92% until complete response lands
          const step = Math.floor(Math.random() * 3) + 2;
          return Math.min(prev + step, 92);
        }
        return prev;
      });
    }, 600);

    return () => {
      clearInterval(stageTimer);
      clearInterval(percentTimer);
    };
  }, [requestId]);

  const currentStage = STAGES[currentStageIndex];

  return (
    <div className="w-full max-w-lg mx-auto p-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-6 transition-all duration-300">
      {/* GLOWING ICON HEADER */}
      <div className="relative w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20 shadow-sm">
        <Sparkles className="w-8 h-8 animate-pulse text-amber-500" />
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
        </span>
      </div>

      {/* HEADER TITLE & CURRENT STATUS */}
      <div>
        <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-xl tracking-tight mb-1">
          Analyzing your video
        </h3>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Finding key ideas and important moments...
        </p>
      </div>

      {/* ANIMATED PROGRESS BAR & PERCENTAGE */}
      <div className="space-y-2 px-2">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-amber-600 dark:text-amber-400 font-extrabold tracking-wide truncate max-w-[280px]">
            {currentStage.label}
          </span>
          <span className="text-slate-900 dark:text-slate-100 font-mono font-extrabold">{percent}%</span>
        </div>

        <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200/60 dark:border-slate-700/60">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 rounded-full transition-all duration-500 ease-out shadow-sm"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* STAGE CHECKLIST */}
      <div className="space-y-2.5 text-left border-t border-slate-100 dark:border-slate-800 pt-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
          Processing Pipeline
        </div>

        {STAGES.map((stage, idx) => {
          const isCompleted = idx < currentStageIndex;
          const isCurrent = idx === currentStageIndex;

          return (
            <div key={stage.id} className="flex items-center gap-3 text-xs">
              {isCompleted ? (
                <div className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              ) : isCurrent ? (
                <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 shrink-0" />
              )}

              <span
                className={`font-semibold ${
                  isCompleted
                    ? 'text-slate-900 dark:text-slate-100'
                    : isCurrent
                    ? 'text-amber-600 dark:text-amber-400 font-extrabold'
                    : 'text-slate-400'
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* REASSURING LONG VIDEO NOTICE */}
      <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-300 font-medium text-left leading-relaxed">
        <span className="font-bold block mb-0.5">Processing Note</span>
        Long videos can take a little longer. We're carefully processing the full transcript so you get a better analysis.
      </div>
    </div>
  );
};
