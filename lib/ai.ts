import { generateAIAnalysis } from './ai/provider';
import { KwipAnalysisResult, TemplateStyle, OutputFormat, SourceMetadata } from '@/types/kwip';

export { KwipAnalysisSchema, generateAIAnalysis } from './ai/provider';

export async function analyzeTranscriptWithOpenRouter(
  transcript: string,
  metadata: SourceMetadata,
  style: TemplateStyle = 'editorial',
  formats: OutputFormat[] = ['brief', 'carousel', 'pdf']
): Promise<KwipAnalysisResult> {
  return generateAIAnalysis(transcript, metadata, style, formats);
}
