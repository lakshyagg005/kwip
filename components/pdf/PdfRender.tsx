'use client';

import React, { useState, useRef, useEffect } from 'react';
import { KwipAnalysisResult } from '@/types/kwip';
import { Download, FileText, Printer, BookOpen, Layers, BarChart2, Quote, CheckCircle2 } from 'lucide-react';
import { downloadElementAsPdf } from '@/lib/export';
import { preparePdf, PreparedPdfPageData } from '@/lib/ai/prepareFormatData';

interface PdfRenderProps {
  data: KwipAnalysisResult;
}

export const PdfRender: React.FC<PdfRenderProps> = ({ data }) => {
  const [downloading, setDownloading] = useState(false);
  const pdfPages: PreparedPdfPageData[] = preparePdf(data);

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      await downloadElementAsPdf('pdf-export-multipage-container', `${data.id}_full_pdf_report`);
    } catch (err) {
      console.error('PDF Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-6">
      {/* PDF BAR CONTROLS */}
      <div className="w-full max-w-4xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900 text-white p-3.5 sm:p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />
          <span>Full Multi-Page Executive PDF Report ({pdfPages.length} Pages)</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 justify-end">
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2.5 sm:py-2 rounded-lg transition flex-1 sm:flex-none"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Print</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex items-center justify-center gap-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 sm:py-2 rounded-lg transition shadow disabled:opacity-50 flex-1 sm:flex-none"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{downloading ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>
        </div>
      </div>

      {/* PDF PREVIEW DISPLAY */}
      <div
        id="pdf-export-multipage-container"
        className="w-full max-w-4xl flex flex-col items-center gap-8"
      >
        {pdfPages.map((page, idx) => (
          <PdfSinglePageWrapper key={idx} page={page} totalPages={pdfPages.length} />
        ))}
      </div>
    </div>
  );
};

interface PdfSinglePageProps {
  page: PreparedPdfPageData;
  totalPages: number;
}

const PdfSinglePageWrapper: React.FC<PdfSinglePageProps> = ({ page, totalPages }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pageHeight, setPageHeight] = useState(1123);

  useEffect(() => {
    const updateScaleAndHeight = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth;
        if (availableWidth > 0 && availableWidth < 794) {
          setScale(availableWidth / 794);
        } else {
          setScale(1);
        }
      }
      if (pageRef.current) {
        setPageHeight(Math.max(pageRef.current.scrollHeight, 1123));
      }
    };

    updateScaleAndHeight();
    const observer = new ResizeObserver(updateScaleAndHeight);
    if (containerRef.current) observer.observe(containerRef.current);
    if (pageRef.current) observer.observe(pageRef.current);

    window.addEventListener('resize', updateScaleAndHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScaleAndHeight);
    };
  }, [page]);

  const canvasWidth = 794;
  const scaledWidth = Math.round(canvasWidth * scale);
  const scaledHeight = Math.round(pageHeight * scale);

  return (
    <div ref={containerRef} className="w-full flex justify-center items-center">
      {scale < 1 ? (
        <div
          className="relative overflow-hidden rounded-xl shadow-lg border border-slate-200 bg-white transition-all duration-200"
          style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
        >
          <div
            style={{
              width: `${canvasWidth}px`,
              height: `${pageHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <div ref={pageRef}>
              <PdfSinglePage page={page} totalPages={totalPages} />
            </div>
          </div>
        </div>
      ) : (
        <div ref={pageRef}>
          <PdfSinglePage page={page} totalPages={totalPages} />
        </div>
      )}
    </div>
  );
};

const PdfSinglePage: React.FC<PdfSinglePageProps> = ({ page, totalPages }) => {
  return (
    <div
      className="kwip-pdf-single-page w-[794px] bg-white text-slate-900 p-8 md:p-12 rounded-xl shadow-lg border border-slate-200 min-h-[1123px] flex flex-col justify-between"
      style={{ fontFamily: 'Georgia, Cambria, serif' }}
    >
      <div className="space-y-6">
        {/* PDF PAGE HEADER */}
        <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
          <div>
            <div className="text-[11px] font-black tracking-widest uppercase text-amber-600 font-sans mb-1">
              KWIP EXECUTIVE REPORT • PAGE {page.pageNumber} OF {totalPages}
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-950 mb-1 leading-tight">
              {page.title}
            </h1>
            <p className="text-xs text-slate-500 font-sans">
              Source: <span className="font-semibold text-slate-700">{page.source.videoTitle}</span> ({page.source.channelTitle})
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="font-extrabold text-2xl tracking-tighter text-slate-900 block font-sans">KWIP</span>
          </div>
        </div>

        {/* PAGE 1 CONTENT: OVERVIEW, THESIS, SUMMARY + FIRST KEY CONCEPTS (NO BLANK SPACE) */}
        {page.isPageOne && (
          <div className="space-y-6">
            {page.hook && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-xl font-sans">
                <span className="text-[11px] uppercase font-bold tracking-wider text-amber-800 block mb-1">
                  CORE THESIS
                </span>
                <p className="text-base font-bold text-slate-950 leading-relaxed">
                  &quot;{page.hook}&quot;
                </p>
              </div>
            )}

            {page.executiveSummary && (
              <div className="space-y-2 font-sans">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-500" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Executive Overview
                  </h2>
                </div>
                <p className="text-sm leading-relaxed text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {page.executiveSummary}
                </p>
              </div>
            )}
          </div>
        )}

        {/* KEY CONCEPTS SECTION */}
        {page.keyIdeas && page.keyIdeas.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b pb-2 border-slate-200 font-sans">
              <Layers className="w-4 h-4 text-amber-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {page.isPageOne ? 'Key Concepts & Principles' : 'Key Concepts & Principles (Continued)'}
              </h2>
            </div>

            <div className="space-y-4">
              {page.keyIdeas.map((idea) => (
                <div key={idea.number} className="border-b border-slate-100 pb-4 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white font-sans text-xs flex items-center justify-center font-bold">
                        {idea.number}
                      </span>
                      <h3 className="font-bold text-base text-slate-950">{idea.title}</h3>
                    </div>
                    {idea.tag && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-sans">
                        {idea.tag}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-800 mb-1 pl-7 leading-relaxed">
                    {idea.summary}
                  </p>
                  <p className="text-xs text-slate-600 pl-7 leading-relaxed">
                    {idea.explanation}
                  </p>
                  {idea.example && (
                    <p className="text-xs text-slate-500 italic pl-7 mt-1 font-sans">
                      Example: {idea.example}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FRAMEWORK SECTION */}
        {page.framework && page.framework.steps && page.framework.steps.length > 0 && (
          <div className="p-5 rounded-xl border bg-slate-50 border-slate-200 font-sans mt-4">
            <div className="mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block mb-0.5">
                Framework & Process
              </span>
              <h2 className="text-lg font-bold text-slate-950">{page.framework.title}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {page.framework.steps.map((step) => (
                <div key={step.stepNumber} className="bg-white p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-4 h-4 rounded bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {step.stepNumber}
                    </span>
                    <h4 className="font-bold text-xs text-slate-900">{step.title}</h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STATS & QUOTES */}
        {((page.statistics && page.statistics.length > 0) || (page.quotes && page.quotes.length > 0)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
            {page.statistics && page.statistics.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart2 className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Key Data & Metrics
                  </h3>
                </div>
                {page.statistics.map((s, i) => (
                  <div key={i} className="p-3 rounded-lg border bg-emerald-50/50 border-emerald-200 flex items-start gap-3">
                    <div className="text-lg font-black text-emerald-600 shrink-0">{s.value}</div>
                    <div>
                      <div className="font-bold text-xs text-slate-900">{s.label}</div>
                      <div className="text-[11px] text-slate-500">{s.context}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {page.quotes && page.quotes.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Quote className="w-4 h-4 text-purple-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Notable Quotes
                  </h3>
                </div>
                {page.quotes.map((q, i) => (
                  <div key={i} className="p-3 rounded-lg border bg-purple-50/50 border-purple-200">
                    <p className="text-xs font-semibold italic text-slate-800 mb-1">&quot;{q.text}&quot;</p>
                    {q.speaker && <span className="text-[11px] font-bold text-purple-700 block">— {q.speaker}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ACTIONABLE TAKEAWAYS */}
        {page.actionSteps && page.actionSteps.length > 0 && (
          <div className="bg-slate-950 text-white p-5 rounded-xl font-sans">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Actionable Takeaways
              </h2>
            </div>
            <div className="space-y-2">
              {page.actionSteps.map((step) => (
                <div key={step.stepNumber} className="flex items-start gap-2.5 text-xs">
                  <span className="font-bold text-emerald-400">{step.stepNumber}.</span>
                  <div>
                    <span className="font-semibold">{step.action}</span>
                    {step.impact && <span className="text-slate-400"> — {step.impact}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FINAL INSIGHT */}
        {page.finalTakeaway && (
          <div className="p-4 rounded-xl border bg-amber-50 border-amber-200 text-center font-sans">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-1">
              Final Takeaway
            </span>
            <p className="text-xs font-bold text-slate-950">{page.finalTakeaway}</p>
          </div>
        )}
      </div>

      {/* PDF PAGE FOOTER */}
      <div className="border-t border-slate-200 pt-4 text-center font-sans shrink-0">
        <div className="text-[11px] text-slate-500">
          Generated with KWIP • Turn long videos into visuals worth sharing
        </div>
      </div>
    </div>
  );
};
