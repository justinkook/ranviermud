import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import sanitize from 'sanitize-filename';
import OpenAI from 'openai';

export interface ResearchOptions {
  outDir: string;
  query?: string;
  maxPages?: number;
  urls?: string[];
  summarize?: boolean;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function summarizeText(text: string, client: OpenAI, model: string): Promise<string> {
  const input = text.slice(0, 6000);
  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'Summarize the text into a concise 6-10 bullet outline capturing key plot points, characters, and timeline cues. Return markdown bullets only.' },
      { role: 'user', content: input },
    ],
    temperature: 0.3,
  });
  return resp.choices?.[0]?.message?.content?.trim() || '';
}

function loadQueryUrls(query: string, baseDir: string): string[] {
  const sourcesFile = process.env.CANON_SOURCES_FILE
    ? (path.isAbsolute(process.env.CANON_SOURCES_FILE) ? process.env.CANON_SOURCES_FILE : path.resolve(process.cwd(), process.env.CANON_SOURCES_FILE))
    : path.join(baseDir, 'sources.json');
  if (sourcesFile && fs.existsSync(sourcesFile)) {
    try {
      const map = JSON.parse(fs.readFileSync(sourcesFile, 'utf8')) as Record<string, string[] | { urls: string[] }>;
      const entry = map[query];
      if (Array.isArray(entry)) return entry;
      if (entry && Array.isArray((entry as any).urls)) return (entry as any).urls as string[];
    } catch {}
  }
  const envList = process.env.CANON_SOURCES;
  if (envList) return envList.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const html = await res.text();
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return article?.textContent || '';
  } catch {
    return html;
  }
}

export async function researchAndIngest(opts: ResearchOptions): Promise<{ written: string[] }> {
  const outDir = path.isAbsolute(opts.outDir) ? opts.outDir : path.resolve(process.cwd(), opts.outDir);
  ensureDir(outDir);

  const written: string[] = [];
  const now = new Date().toISOString();

  const aiEnabled = !!opts.summarize;
  const client = aiEnabled ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-local', baseURL: process.env.OPENAI_BASE_URL }) : null;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  // Load URLs from sources if query provided and no explicit URLs passed
  let urls: string[] = opts.urls || [];
  if (opts.query && urls.length === 0) {
    urls = loadQueryUrls(opts.query, outDir);
  }

  // URL fetch branch
  for (const u of urls) {
    try {
      const content = await fetchUrl(u);
      const baseName = sanitize(new URL(u).hostname + new URL(u).pathname.replace(/\/+/, '-')) || 'site';
      const file = path.join(outDir, `${baseName}.site.txt`);
      const header = `URL: ${u}\nFetched: ${now}\n\n`;
      fs.writeFileSync(file, header + content);
      written.push(file);

      if (aiEnabled && client) {
        try {
          const sum = await summarizeText(content, client, model);
          const sumFile = path.join(outDir, `${baseName}.site.summary.md`);
          fs.writeFileSync(sumFile, `# Summary: ${u}\n\n${sum}`);
          written.push(sumFile);
        } catch {}
      }
    } catch {
      // ignore
    }
  }

  // Update a simple index
  const indexPath = path.join(outDir, 'index.json');
  const prev = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { docs: [] };
  const docs = [...new Set([...(prev.docs || []), ...written])];
  fs.writeFileSync(indexPath, JSON.stringify({ updatedAt: now, docs }, null, 2));

  return { written };
}


