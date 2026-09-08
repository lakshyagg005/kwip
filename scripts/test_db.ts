import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDB() {
  console.log('Testing Supabase DB connection...');
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').limit(5);
  console.log('Profiles select:', { count: profiles?.length, error: pErr });

  const { data: usage, error: uErr } = await supabase.from('analysis_usage').select('*').limit(5);
  console.log('Analysis usage select:', { count: usage?.length, error: uErr });
}

testDB();
