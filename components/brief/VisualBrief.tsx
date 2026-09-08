'use client';

import React, { useState, useRef, useEffect } from 'react';
import { KwipAnalysisResult } from '@/types/kwip';
import { Download, Image as ImageIcon } from 'lucide-react';
import { downloadElementAsPng } from '@/lib/export';
import { VisualBriefCanvas } from './VisualBriefCanvas';

interface VisualBriefProps {
  data: KwipAnalysisResult;
  id?: string;
}

export const VisualBrief: React.FC<VisualBriefProps> = ({ data, id = 'visual-brief-container' }) => {
  const [downloading, setDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.85);
  const [canvasHeight, setCanvasHeight] = useState(1123);

  // Dynamically compute scale ratio and measure true rendered canvas height
  useEffect(() => {
    const updateScaleAndHeight = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth;
        if (availableWidth > 0) {
          // Logical canvas width is 794px with minimum scale floor for 320px screens
          const calculatedScale = Math.min(Math.max((availableWidth - 16) / 794, 0.35), 1);
          setScale(calculatedScale);
        }
      }

      const canvasEl = document.getElementById(id);
      if (canvasEl && canvasEl.scrollHeight > 0) {
        setCanvasHeight(Math.max(canvasEl.scrollHeight, 1123));
      }
    };

    updateScaleAndHeight();

    const observer = new ResizeObserver(() => {
      updateScaleAndHeight();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    const canvasEl = document.getElementById(id);
    if (canvasEl) {
      observer.observe(canvasEl);
    }

    window.addEventListener('resize', updateScaleAndHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScaleAndHeight);
    };
  }, [id, data]);

  const handleDownloadPng = async () => {
    try {
      setDownloading(true);
      await downloadElementAsPng('visual-brief-single-page-export', `${data.id}_visual_brief`);
    } catch (err) {
      console.error('PNG Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const canvasWidth = 794;
  const scaledWidth = Math.round(canvasWidth * scale);
  const scaledHeight = Math.round(canvasHeight * scale);

  return (
    <div className="w-full flex flex-col items-center gap-4 sm:gap-6">
      {/* ACTION BAR FOR IMAGE EXPORT */}
      <div className="w-full max-w-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900 text-white p-3.5 sm:p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
          <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />
          <span>Single-Page Executive Visual Brief</span>
        </div>

        <button
          onClick={handleDownloadPng}
          disabled={downloading}
          className="flex items-center justify-center gap-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 sm:py-2 rounded-lg transition shadow disabled:opacity-50 w-full sm:w-auto"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>{downloading ? 'Generating PNG...' : 'Download Image (PNG)'}</span>
        </button>
      </div>

      {/* RESPONSIVE PREVIEW CONTAINER (PROPORTIONALLY SCALED FOR ALL VIEWPORTS) */}
      <div
        ref={containerRef}
        className="w-full max-w-2xl mx-auto flex justify-center items-center p-2 rounded-2xl bg-slate-200/50 dark:bg-slate-900/50 border border-slate-300/80 dark:border-slate-800"
      >
        <div
          className="relative overflow-hidden rounded-xl shadow-2xl bg-white dark:bg-slate-950 transition-all duration-200"
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
          }}
        >
          <div
            style={{
              width: `${canvasWidth}px`,
              height: `${canvasHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <VisualBriefCanvas data={data} id={id} />
          </div>
        </div>
      </div>

      {/* OFF-SCREEN NATIVE CANVAS FOR CRISP PNG EXPORT */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none opacity-0">
        <VisualBriefCanvas data={data} id="visual-brief-single-page-export" />
      </div>
    </div>
  );
};
