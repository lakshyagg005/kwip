# KWIP

KWIP turns YouTube videos into structured visual knowledge.

KWIP processes YouTube videos and extracts grounded, high-signal insights into clean visual formats designed for rapid comprehension and sharing.

> **Note**: KWIP currently supports YouTube videos up to 30 minutes in length.

---

## Capabilities

- **Visual Brief**: Comprehensive interactive canvas featuring core thesis, key concepts, quantitative metrics, verbatim quotes, and actionable takeaways.
- **Social Carousel**: Multi-slide visual carousel tailored for sharing structured knowledge on social platforms.
- **PDF & PNG Exports**: Clean, multi-page vector PDF summaries and high-resolution image exports.
- **Personal Knowledge Library**: Save, search, filter, and review analyzed videos with ease.
- **Fact-Grounded Analysis**: Content-first extraction pipeline built for high accuracy and minimal noise.

---

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, TypeScript)
- **Styling**: Tailwind CSS, Lucide Icons, Canvas & HTML5 rendering
- **Database & Auth**: [Supabase](https://supabase.com/)
- **AI Infrastructure**: Multi-provider pipeline (Groq, OpenRouter, NVIDIA NIM)
- **Export Engine**: html2canvas & jsPDF custom rendering pipeline

---

## Environment Setup

Follow these steps to run KWIP locally:

### 1. Clone the repository
```bash
git clone https://github.com/lakshyagg005/kwip.git
cd kwip
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env.local` file in the project root based on `.env.example`:

```bash
cp .env.example .env.local
```

Fill in your configuration:

```env
# AI Providers (at least one key required)
GROQ_API_KEY=your_groq_key
OPENROUTER_API_KEY=your_openrouter_key
NVIDIA_API_KEY=your_nvidia_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
```

### 4. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification & Build

To check types and verify a production build:

```bash
npm run build
```

---

## Deployment

KWIP is optimized for deployment on [Vercel](https://vercel.com/). Ensure all environment variables specified in `.env.example` are configured in your Vercel project settings.
