export type ContentType = 'educational' | 'podcast' | 'tutorial' | 'business' | 'documentary';

export type TemplateStyle = 'editorial' | 'minimal' | 'bold' | 'academic' | 'dark';

export type OutputFormat = 'brief' | 'carousel' | 'pdf';

export interface KeyIdea {
  number: number;
  title: string;
  summary: string;
  explanation: string;
  example?: string;
  tag?: string;
}

export interface FrameworkStep {
  stepNumber: number;
  title: string;
  description: string;
}

export interface Framework {
  title: string;
  subtitle?: string;
  steps: FrameworkStep[];
}

export interface Statistic {
  value: string;
  label: string;
  context: string;
}

export interface Quote {
  text: string;
  speaker?: string;
  context?: string;
}

export interface ActionStep {
  stepNumber: number;
  action: string;
  impact?: string;
}

export interface SourceMetadata {
  videoTitle: string;
  videoId: string;
  channelTitle: string;
  duration?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  videoUrl: string;
}

export interface KwipAnalysisResult {
  id: string;
  createdAt: string;
  contentType: ContentType;
  title: string;
  hook: string;
  executiveSummary: string;
  keyIdeas: KeyIdea[];
  framework?: Framework;
  statistics: Statistic[];
  quotes: Quote[];
  actionSteps: ActionStep[];
  finalTakeaway: string;
  source: SourceMetadata;
  style: TemplateStyle;
  selectedFormats: OutputFormat[];
  isPublic?: boolean;
  partialAnalysisWarning?: string;
}

export interface CarouselSlide {
  slideNumber: number;
  totalSlides: number;
  type: 'intro' | 'idea' | 'framework' | 'stat' | 'quote' | 'action' | 'outro';
  badge?: string;
  headline: string;
  subheadline?: string;
  bullets?: string[];
  quote?: { text: string; author?: string };
  stat?: { value: string; label: string };
  highlightBox?: string;
  footerTag?: string;
}

export interface ProcessingProgressState {
  step: 'validating' | 'fetching_transcript' | 'analyzing' | 'building_assets' | 'completed' | 'error';
  message: string;
  details?: string;
  percent: number;
}
