import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KWIP — Visual Summaries from YouTube Videos",
  description: "Transform YouTube videos up to 30 minutes into single-page Visual Briefs, Social Carousels, and Executive PDFs.",
  keywords: ["YouTube summary", "visual brief", "social carousel", "PDF summary", "KWIP", "video distillation"],
  openGraph: {
    title: "KWIP — Visual Summaries from YouTube Videos",
    description: "Transform YouTube videos up to 30 minutes into single-page Visual Briefs, Social Carousels, and Executive PDFs.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "KWIP — Visual Summaries from YouTube Videos",
    description: "Transform YouTube videos up to 30 minutes into single-page Visual Briefs, Social Carousels, and Executive PDFs.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
