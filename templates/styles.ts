import { TemplateStyle } from '@/types/kwip';

export interface ThemeColors {
  bg: string;
  cardBg: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentBg: string;
  accentText: string;
  badgeBg: string;
  quoteBg: string;
  gradientHeader: string;
  fontFamily: string;
}

export const TEMPLATE_THEMES: Record<TemplateStyle, ThemeColors> = {
  editorial: {
    bg: 'bg-[#FBFBFA]',
    cardBg: 'bg-white',
    text: 'text-[#0E121B]',
    textMuted: 'text-[#525866]',
    border: 'border-[#E5E7EB]',
    accent: 'text-[#E05236]',
    accentBg: 'bg-[#FFF0ED]',
    accentText: 'text-[#9A2D18]',
    badgeBg: 'bg-[#F3F4F6]',
    quoteBg: 'bg-[#FFF8F6]',
    gradientHeader: 'from-[#FFF0ED] via-[#F3E8FF] to-[#EFF6FF]',
    fontFamily: 'font-serif',
  },
  minimal: {
    bg: 'bg-[#FFFFFF]',
    cardBg: 'bg-[#FAFAFA]',
    text: 'text-[#111827]',
    textMuted: 'text-[#6B7280]',
    border: 'border-[#E5E7EB]',
    accent: 'text-[#2563EB]',
    accentBg: 'bg-[#EFF6FF]',
    accentText: 'text-[#1E40AF]',
    badgeBg: 'bg-[#F3F4F6]',
    quoteBg: 'bg-[#F8FAFC]',
    gradientHeader: 'from-[#EFF6FF] via-[#F8FAFC] to-[#F1F5F9]',
    fontFamily: 'font-sans',
  },
  bold: {
    bg: 'bg-[#FFFDFA]',
    cardBg: 'bg-white',
    text: 'text-[#0F172A]',
    textMuted: 'text-[#475569]',
    border: 'border-2 border-[#0F172A]',
    accent: 'text-[#8B5CF6]',
    accentBg: 'bg-[#F3E8FF]',
    accentText: 'text-[#6D28D9]',
    badgeBg: 'bg-[#F3E8FF]',
    quoteBg: 'bg-[#FAF5FF]',
    gradientHeader: 'from-[#F3E8FF] via-[#FFF0ED] to-[#FEF3C7]',
    fontFamily: 'font-sans',
  },
  academic: {
    bg: 'bg-[#F8F6F0]',
    cardBg: 'bg-[#FFFDF9]',
    text: 'text-[#1A202C]',
    textMuted: 'text-[#4A5568]',
    border: 'border-[#E2E8F0]',
    accent: 'text-[#0D9488]',
    accentBg: 'bg-[#CCFBF1]',
    accentText: 'text-[#0F766E]',
    badgeBg: 'bg-[#EDF2F7]',
    quoteBg: 'bg-[#F0FDF4]',
    gradientHeader: 'from-[#F0FDF4] via-[#F8F6F0] to-[#E6FFFA]',
    fontFamily: 'font-serif',
  },
  dark: {
    bg: 'bg-[#0B0F17]',
    cardBg: 'bg-[#151C2C]',
    text: 'text-[#F8FAFC]',
    textMuted: 'text-[#94A3B8]',
    border: 'border-[#1E293B]',
    accent: 'text-[#38BDF8]',
    accentBg: 'bg-[#0369A1]/40',
    accentText: 'text-[#38BDF8]',
    badgeBg: 'bg-[#1E293B]',
    quoteBg: 'bg-[#131B2E]',
    gradientHeader: 'from-[#1E1B4B] via-[#0F172A] to-[#0B0F17]',
    fontFamily: 'font-sans',
  },
};
