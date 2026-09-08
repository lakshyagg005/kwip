'use client';

import React, { useState } from 'react';
import { VisualBrief } from '@/components/brief/VisualBrief';
import { CarouselRender } from '@/components/carousel/CarouselRender';
import { PdfRender } from '@/components/pdf/PdfRender';
import { KwipAnalysisResult } from '@/types/kwip';
import { YoutubeIcon } from '@/components/ui/YoutubeIcon';
import { FileText, Layers, Download, Play, Clock, User } from 'lucide-react';

const DEMO_DATA: KwipAnalysisResult = {
  id: 'demo_startup_101',
  createdAt: new Date().toISOString(),
  contentType: 'business',
  title: 'How to Talk to Users: Customer Discovery Playbook',
  hook: 'The single biggest mistake founders make is asking users what features they want built instead of asking about past behavior.',
  executiveSummary: 'A practical masterclass on conducting effective customer discovery interviews, avoiding false compliments, and focusing on past user behaviors to validate startup ideas.',
  keyIdeas: [
    {
      number: 1,
      title: 'Ask About Specific Past Behavior',
      summary: 'Focus customer interviews on what users actually did in the past rather than hypothetical future intentions.',
      explanation: 'People are terrible at predicting their future behavior but reliable when recounting specific past actions and expenses.',
      example: 'Asking "How much did you spend fixing this last month?" instead of "Would you pay $50 for a tool?"',
      tag: 'Validation',
    },
    {
      number: 2,
      title: 'Identify Current Workarounds',
      summary: 'Target users who have already attempted to solve the problem using hacky spreadsheets or manual workflows.',
      explanation: 'If a user hasn\'t actively tried to solve a pain point, the problem isn\'t severe enough to pay for software.',
      tag: 'Discovery',
    },
    {
      number: 3,
      title: 'Extract Problem Signals, Not Feature Lists',
      summary: 'Document exact user pain stories to inform product prioritization instead of building requested feature lists.',
      explanation: 'Users know their problems well, but founders are responsible for designing the actual product solution.',
      tag: 'Execution',
    },
    {
      number: 4,
      title: 'Listen More Than You Talk',
      summary: 'Keep customer interviews conversational and limit founder speaking time to under twenty percent.',
      explanation: 'Pitching your product during discovery biases user responses and hides critical friction signals.',
      tag: 'Strategy',
    },
  ],
  framework: {
    title: 'The 3 Rules of Customer Discovery',
    subtitle: 'Framework for unearthing actionable user truth',
    steps: [
      { stepNumber: 1, title: 'Talk About Their Life, Not Your Idea', description: 'Focus on their workflow and current problems rather than pitching your vision.' },
      { stepNumber: 2, title: 'Ask About Specifics in the Past', description: 'Inquire about exact past occurrences rather than generic opinions or hypothetical promises.' },
      { stepNumber: 3, title: 'Listen More Than You Talk', description: 'Let the user speak for 80% of the conversation to uncover genuine pain points.' },
    ],
  },
  statistics: [
    { value: '22 Mins', label: 'Video Duration', context: 'Full Y Combinator lecture duration' },
    { value: '80%', label: 'User Speaking Time', context: 'Target percentage of interview time user should be talking' },
  ],
  quotes: [
    { text: 'Talk about their life instead of your idea. Ask about specifics in the past instead of generic opinions.', speaker: 'Eric Migicovsky', context: 'On conducting user discovery calls' },
  ],
  actionSteps: [
    { stepNumber: 1, action: 'Schedule 5 discovery calls with target users this week', impact: 'Uncover active workflow pain points' },
    { stepNumber: 2, action: 'Audit interview questions to eliminate hypothetical questions', impact: 'Ensure grounded user responses' },
  ],
  finalTakeaway: 'Uncover real past user behavior and existing workarounds before building your product.',
  source: {
    videoId: 'C27RVao2abu',
    videoTitle: 'How to Talk to Users',
    channelTitle: 'Y Combinator',
    videoUrl: 'https://www.youtube.com/watch?v=C27RVao2abu',
    thumbnailUrl: 'https://i.ytimg.com/vi/C27RVao2abu/hqdefault.jpg',
    duration: '22m 45s',
  },
  style: 'editorial',
  selectedFormats: ['brief', 'carousel', 'pdf'],
};

export const InteractiveDemo = () => {
  const [activeTab, setActiveTab] = useState<'brief' | 'carousel' | 'pdf'>('brief');

  return (
    <section id="demo" className="py-20 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200/60 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-2">
            Interactive Product Demo
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-4">
            See KWIP in Action
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base">
            Switch between Visual Brief, Social Carousel, and PDF to see how KWIP formats structured information.
          </p>
        </div>

        {/* DEMO GRID: LEFT VIDEO CARD, RIGHT KWIP OUTPUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT VIDEO METADATA CARD */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md">
            <div className="relative aspect-video rounded-xl bg-slate-950 overflow-hidden mb-4 group">
              <img
                src={DEMO_DATA.source.thumbnailUrl}
                alt="Demo video thumbnail"
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                </div>
              </div>
              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-slate-950/80 text-white text-[10px] font-mono">
                22:45
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400 mb-2">
              <YoutubeIcon className="w-4 h-4" />
              <span>{DEMO_DATA.source.channelTitle}</span>
            </div>

            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base mb-3 leading-snug">
              {DEMO_DATA.source.videoTitle}
            </h3>

            <div className="text-xs text-slate-500 space-y-2 border-t pt-3 border-slate-100 dark:border-slate-800">
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">22 mins 45 secs</span>
              </div>
              <div className="flex justify-between">
                <span>Content Category:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300 capitalize">{DEMO_DATA.contentType}</span>
              </div>
              <div className="flex justify-between">
                <span>Key Takeaways Extracted:</span>
                <span className="font-medium text-amber-600 dark:text-amber-400 font-bold">4 Ideas + 1 Framework</span>
              </div>
            </div>
          </div>

          {/* RIGHT OUTPUT PREVIEW CONTAINER WITH SWITCHER TABS */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-950 p-3 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            {/* TABS */}
            <div className="flex items-center justify-between border-b pb-4 mb-6 border-slate-200 dark:border-slate-800 flex-wrap gap-3">
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                <button
                  onClick={() => setActiveTab('brief')}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    activeTab === 'brief'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 shrink-0" />
                  <span>Visual Brief</span>
                </button>

                <button
                  onClick={() => setActiveTab('carousel')}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    activeTab === 'carousel'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500 shrink-0" />
                  <span>Social Carousel</span>
                </button>

                <button
                  onClick={() => setActiveTab('pdf')}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    activeTab === 'pdf'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 shrink-0" />
                  <span>PDF Summary</span>
                </button>
              </div>

              <span className="text-[11px] sm:text-xs font-bold text-amber-600 dark:text-amber-400">
                Live Interactive Preview
              </span>
            </div>

            {/* TAB CONTENTS */}
            <div className="w-full max-h-[650px] overflow-y-auto pr-0.5">
              {activeTab === 'brief' && <VisualBrief data={DEMO_DATA} id="demo-brief" />}
              {activeTab === 'carousel' && <CarouselRender data={DEMO_DATA} />}
              {activeTab === 'pdf' && <PdfRender data={DEMO_DATA} />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
