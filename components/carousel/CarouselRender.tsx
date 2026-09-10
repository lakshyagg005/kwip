'use client';

import React, { useState } from 'react';
import { KwipAnalysisResult } from '@/types/kwip';

import { YoutubeIcon } from '@/components/ui/YoutubeIcon';
import { ChevronLeft, ChevronRight, Download, Quote, FileText } from 'lucide-react';
import { downloadCarouselSlide, downloadCarouselDeckAsPdf } from '@/lib/export';
import { prepareCarousel, CarouselSlideData } from '@/lib/ai/prepareFormatData';

interface CarouselRenderProps {
  data: KwipAnalysisResult;
}

export const CarouselRender: React.FC<CarouselRenderProps> = ({ data }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [exportingDeck, setExportingDeck] = useState(false);

  // 1. Prepare format-specific carousel slide deck
  const slides: CarouselSlideData[] = prepareCarousel(data);
  const currentSlide = slides[currentSlideIndex];

  const handleNext = () => {
    setCurrentSlideIndex((prev) => (prev < slides.length - 1 ? prev + 1 : prev));
  };

  const handlePrev = () => {
    setCurrentSlideIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleDownloadCurrentSlide = async () => {
    const elementId = `carousel-slide-export-${currentSlideIndex}`;
    await downloadCarouselSlide(elementId, `${data.id}_slide_${currentSlideIndex + 1}`);
  };

  const handleDownloadDeckPdf = async () => {
    try {
      setExportingDeck(true);
      const slideElementIds = slides.map((_, i) => `carousel-slide-export-${i}`);
      await downloadCarouselDeckAsPdf(slideElementIds, `${data.id}_carousel_deck`);
    } catch (err) {
      console.error('Deck export error:', err);
    } finally {
      setExportingDeck(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-6">
      {/* CONTROLS BAR */}
      <div className="w-full max-w-xl flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 text-white p-3 sm:p-3.5 rounded-xl shadow-md">
        <div className="flex items-center gap-2 text-xs font-bold w-full sm:w-auto justify-between sm:justify-start">
          <span className="bg-amber-500 text-slate-950 px-2 py-0.5 rounded text-[11px] sm:text-xs">1080×1350 (4:5)</span>
          <span className="text-slate-300">
            Slide {currentSlideIndex + 1} of {slides.length}
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              disabled={currentSlideIndex === 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Previous Slide"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <button
              onClick={handleNext}
              disabled={currentSlideIndex === slides.length - 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Next Slide"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleDownloadCurrentSlide}
              className="flex items-center gap-1 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 sm:px-3 py-1.5 rounded-lg transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PNG</span>
            </button>

            <button
              onClick={handleDownloadDeckPdf}
              disabled={exportingDeck}
              className="flex items-center gap-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 px-2.5 sm:px-3 py-1.5 rounded-lg transition border border-slate-700 disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{exportingDeck ? 'Exporting...' : 'Deck PDF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* CAROUSEL CANVAS PREVIEW (Scaled for view) */}
      <div className="relative w-full max-w-[320px] sm:max-w-md aspect-[4/5] shadow-2xl rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 mx-auto">
        <SingleSlideCanvas
          slide={currentSlide}
          slideIndex={currentSlideIndex}
          totalSlides={slides.length}
          styleKey={data.style || 'editorial'}
          channelTitle={data.source.channelTitle}
          id={`carousel-slide-preview-${currentSlideIndex}`}
        />
      </div>

      {/* SLIDE THUMBNAIL STRIP */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto w-full max-w-full p-2 justify-start sm:justify-center">
        {slides.map((s, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentSlideIndex(idx)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              currentSlideIndex === idx
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            Slide {idx + 1}
          </button>
        ))}

        <button
          onClick={handleDownloadDeckPdf}
          className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline ml-2 whitespace-nowrap"
        >
          Download Full Deck (PDF)
        </button>
      </div>

      {/* OFF-SCREEN HIGH-RES 1080x1350 CANVASES FOR EXPORT */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none opacity-0">
        {slides.map((slide, idx) => (
          <div key={idx} className="w-[1080px] h-[1350px]">
            <SingleSlideCanvas
              slide={slide}
              slideIndex={idx}
              totalSlides={slides.length}
              styleKey={data.style || 'editorial'}
              channelTitle={data.source.channelTitle}
              id={`carousel-slide-export-${idx}`}
              isFullCanvas
            />
          </div>
        ))}
      </div>
    </div>
  );
};

interface SingleSlideCanvasProps {
  slide: CarouselSlideData;
  slideIndex: number;
  totalSlides: number;
  styleKey: string;
  channelTitle: string;
  id: string;
  isFullCanvas?: boolean;
}

const SingleSlideCanvas: React.FC<SingleSlideCanvasProps> = ({
  slide,
  slideIndex,
  totalSlides,
  styleKey,
  channelTitle,
  id,
  isFullCanvas = false,
}) => {
  const slideRef = React.useRef<HTMLDivElement>(null);
  const [slideScale, setSlideScale] = useState(1);

  const fontFamily =
    styleKey === 'editorial' || styleKey === 'academic'
      ? 'Georgia, Cambria, serif'
      : 'system-ui, sans-serif';

  const containerStyle = isFullCanvas
    ? { width: '1080px', height: '1350px', fontFamily }
    : { fontFamily };

  // Calculate content volume to dynamically adapt density
  const headlineLen = slide.headline?.length || 0;
  const subheadlineLen = slide.subheadline?.length || 0;
  const bulletCount = slide.bullets?.length || 0;
  const totalBulletChars = (slide.bullets || []).reduce((acc, b) => acc + b.length, 0);

  const isLongHeadline = headlineLen > 55;
  const isHighDensity =
    bulletCount >= 3 ||
    headlineLen + subheadlineLen + totalBulletChars > 220 ||
    Boolean(slide.quote) ||
    Boolean(slide.stat);

  // Scale the ENTIRE slide (header + body + footer) to fit the preview container.
  // This prevents the footer from being clipped by overflow-hidden on dense slides.
  React.useEffect(() => {
    if (isFullCanvas || !slideRef.current) return;
    const el = slideRef.current;
    const checkOverflow = () => {
      // Reset first so scrollHeight reflects natural size
      setSlideScale(1);
      requestAnimationFrame(() => {
        if (!el) return;
        const scrollH = el.scrollHeight;
        const clientH = el.clientHeight;
        if (scrollH > clientH && clientH > 0) {
          // Scale down the whole slide, min 0.65 to keep text legible
          setSlideScale(Math.max(clientH / scrollH, 0.65));
        }
      });
    };
    checkOverflow();
  }, [slide, isFullCanvas]);

  return (
    <div
      id={id}
      ref={!isFullCanvas ? slideRef : undefined}
      className={`w-full h-full ${
        isFullCanvas ? (isHighDensity ? 'p-12 md:p-14' : 'p-16 md:p-20') : 'p-6 md:p-8'
      } flex flex-col justify-between select-none relative bg-white text-slate-900 ${
        styleKey === 'dark' ? 'bg-slate-950 text-slate-100' : ''
      }`}
      style={{
        ...containerStyle,
        ...(!isFullCanvas && slideScale < 1
          ? { transform: `scale(${slideScale})`, transformOrigin: 'top center' }
          : {}),
      }}
    >
      {/* TOP SLIDE HEADER */}
      <div className="flex items-center justify-between border-b pb-4 border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-black text-base tracking-widest text-amber-500">KWIP</span>
          {slide.badge && (
            <span className="text-xs uppercase font-extrabold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {slide.badge}
            </span>
          )}
        </div>
        <span className="text-sm font-mono font-bold text-slate-400">
          0{slideIndex + 1} / 0{totalSlides}
        </span>
      </div>

      {/* MAIN SLIDE CONTENT BODY */}
      <div
        className="my-auto py-4 space-y-4 flex-1 flex flex-col justify-center"
      >
        <h2
          className={`font-extrabold tracking-tight leading-tight text-slate-950 dark:text-slate-50 ${
            isFullCanvas
              ? isLongHeadline || isHighDensity
                ? 'text-3xl md:text-4xl'
                : 'text-5xl'
              : isLongHeadline || isHighDensity
              ? 'text-base md:text-lg'
              : 'text-xl md:text-2xl'
          }`}
        >
          {slide.headline}
        </h2>

        {slide.subheadline && (
          <p
            className={`text-slate-700 dark:text-slate-300 leading-relaxed font-medium ${
              isFullCanvas
                ? isHighDensity
                  ? 'text-lg md:text-xl'
                  : 'text-2xl'
                : 'text-xs md:text-sm'
            }`}
          >
            {slide.subheadline}
          </p>
        )}

        {slide.bullets && slide.bullets.length > 0 && (
          <div className={`space-y-3 ${isFullCanvas ? (isHighDensity ? 'mt-4 space-y-2.5' : 'mt-6') : 'mt-2'}`}>
            {slide.bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span
                  className={`rounded-full bg-amber-500 shrink-0 ${
                    isFullCanvas ? 'w-3 h-3 mt-2' : 'w-2 h-2 mt-1.5'
                  }`}
                />
                <span
                  className={`text-slate-800 dark:text-slate-200 font-semibold leading-relaxed ${
                    isFullCanvas
                      ? isHighDensity
                        ? 'text-base md:text-lg'
                        : 'text-xl'
                      : 'text-xs md:text-sm'
                  }`}
                >
                  {b}
                </span>
              </div>
            ))}
          </div>
        )}

        {slide.quote && (
          <div
            className={`p-5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 ${
              isFullCanvas ? 'my-6 p-6' : 'my-3 p-3'
            }`}
          >
            <Quote
              className={`text-purple-500 mb-1.5 ${
                isFullCanvas ? 'w-7 h-7' : 'w-4 h-4'
              }`}
            />
            <p
              className={`font-semibold italic text-slate-900 dark:text-purple-100 ${
                isFullCanvas ? 'text-xl' : 'text-xs'
              }`}
            >
              "{slide.quote.text}"
            </p>
            {slide.quote.author && (
              <p
                className={`font-bold text-purple-700 dark:text-purple-300 mt-1.5 ${
                  isFullCanvas ? 'text-base' : 'text-[11px]'
                }`}
              >
                — {slide.quote.author}
              </p>
            )}
          </div>
        )}

        {slide.stat && (
          <div
            className={`p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-5 ${
              isFullCanvas ? 'my-6 p-6' : 'my-3 p-3'
            }`}
          >
            <div
              className={`font-black text-emerald-600 dark:text-emerald-400 ${
                isFullCanvas ? 'text-4xl md:text-5xl' : 'text-2xl md:text-3xl'
              }`}
            >
              {slide.stat.value}
            </div>
            <div
              className={`font-bold text-slate-800 dark:text-slate-200 ${
                isFullCanvas ? 'text-lg md:text-xl' : 'text-xs'
              }`}
            >
              {slide.stat.label}
            </div>
          </div>
        )}

        {slide.highlightBox && (
          <div
            className={`p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 font-semibold text-amber-950 dark:text-amber-200 leading-relaxed ${
              isFullCanvas ? 'text-lg p-6' : 'text-xs'
            }`}
          >
            {slide.highlightBox}
          </div>
        )}
      </div>

      {/* BOTTOM SLIDE FOOTER */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-1.5 truncate max-w-[250px]">
          <YoutubeIcon className="w-4 h-4 text-red-500 shrink-0" />
          <span className="truncate text-slate-600 dark:text-slate-400">{channelTitle}</span>
        </div>

        <div className="flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
          <span>Made with</span>
          <span className="text-amber-500">KWIP</span>
        </div>
      </div>
    </div>
  );
};
