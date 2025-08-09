import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';

interface TranscriptEvent {
  t: string;
  type: 'command' | 'output' | 'error' | 'narration' | 'chapter_break' | 'note';
  text?: string;
  choices?: string[];
}

function getSessionsRoot(): string {
  return path.resolve(__dirname, '..', '..', 'sessions');
}

function getLatestSessionId(): string | null {
  const root = getSessionsRoot();
  if (!fs.existsSync(root)) return null;
  const entries = fs.readdirSync(root).filter(f => fs.statSync(path.join(root, f)).isDirectory());
  if (entries.length === 0) return null;
  return entries.sort().reverse()[0];
}

export function exportChapters(sessionId?: string, chapterEverySteps = 50): string {
  const id = sessionId || getLatestSessionId();
  if (!id) throw new Error('No session found');

  const sessionDir = path.join(getSessionsRoot(), id);
  const transcriptPath = path.join(sessionDir, 'transcript.ndjson');
  const storyPath = path.join(sessionDir, 'story.md');
  const outPath = path.join(sessionDir, 'chapters.md');

  const transcriptLines = fs.existsSync(transcriptPath)
    ? fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean)
    : [];
  const events: TranscriptEvent[] = transcriptLines.map(line => {
    try { return JSON.parse(line); } catch { return { t: new Date().toISOString(), type: 'error', text: 'parse-error' }; }
  });

  let stepCount = 0;
  let chapterIndex = 1;
  const chapters: string[] = [];
  let buffer: string[] = [];

  const flushChapter = () => {
    const content = buffer.join('\n').trim();
    if (content) {
      chapters.push(`# Chapter ${chapterIndex}\n\n${content}`);
      chapterIndex += 1;
    }
    buffer = [];
  };

  for (const ev of events) {
    if (ev.type === 'command') {
      stepCount += 1;
      buffer.push(`\n> ${ev.text || ''}`);
    } else if (ev.type === 'narration') {
      if (ev.text) buffer.push(`\n${ev.text}`);
      if (ev.choices && ev.choices.length) buffer.push(`\nChoices: ${ev.choices.join(' | ')}`);
    } else if (ev.type === 'output' && ev.text) {
      buffer.push(`\n${ev.text}`);
    } else if (ev.type === 'note' && ev.text) {
      buffer.push(`\n[Author Note] ${ev.text}`);
    } else if (ev.type === 'chapter_break') {
      flushChapter();
      stepCount = 0;
      continue;
    }

    if (chapterEverySteps > 0 && stepCount > 0 && stepCount % chapterEverySteps === 0) {
      flushChapter();
    }
  }

  // Remainder
  flushChapter();

  const combined = chapters.join('\n\n');
  fs.writeFileSync(outPath, combined || '# Chapter 1\n\n(Empty)');

  // Also copy raw story log at the end for completeness
  if (fs.existsSync(storyPath)) {
    const story = fs.readFileSync(storyPath, 'utf8');
    fs.appendFileSync(outPath, `\n\n---\n\n# Raw Story Log\n\n${story}`);
  }

  return outPath;
}

export async function maybeSummarizeChapters(outPath: string): Promise<void> {
  if (!process.env.AI_SUMMARIZE_CHAPTERS || process.env.AI_SUMMARIZE_CHAPTERS.toLowerCase() !== 'true') return;

  const apiKey = process.env.OPENAI_API_KEY || 'sk-local';
  const baseURL = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const client = new OpenAI({ apiKey, baseURL });

  const content = fs.readFileSync(outPath, 'utf8');
  const chapters = content.split(/\n#{1,6}\s*Chapter\s+\d+\s*\n/i);
  if (chapters.length <= 1) return;

  const summaries: string[] = [];
  for (let i = 1; i < chapters.length; i += 1) {
    const chapterBody = chapters[i].trim().slice(0, 6000);
    try {
      const resp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'Summarize the following chapter into 2-4 sentences. Return plain markdown text without headings.' },
          { role: 'user', content: chapterBody },
        ],
        temperature: 0.5,
      });
      const text = resp.choices?.[0]?.message?.content?.trim() || '';
      summaries.push(text);
    } catch {
      summaries.push('(Summary unavailable)');
    }
  }

  const summaryBlocks = summaries.map((s, idx) => `### Chapter ${idx + 1}\n\n${s}`).join('\n\n');
  const withSummaries = `## Chapter Summaries\n\n${summaryBlocks}\n\n---\n\n${content}`;
  fs.writeFileSync(outPath, withSummaries);
}

export function runExportCli() {
  dotenv.config();
  const sessionId = process.argv[2] || undefined;
  const stepsArg = process.argv[3];
  const steps = stepsArg ? parseInt(stepsArg, 10) : (process.env.CHAPTER_EVERY_STEPS ? parseInt(process.env.CHAPTER_EVERY_STEPS, 10) : 50);
  const out = exportChapters(sessionId, Number.isFinite(steps) ? steps : 50);
  // eslint-disable-next-line no-console
  console.log(`Exported chapters to: ${out}`);
  // Optionally summarize chapters
  maybeSummarizeChapters(out).then(() => {
    // eslint-disable-next-line no-console
    if (process.env.AI_SUMMARIZE_CHAPTERS && process.env.AI_SUMMARIZE_CHAPTERS.toLowerCase() === 'true') {
      console.log('Chapter summaries prepended.');
    }
  });
}

if (require.main === module) {
  runExportCli();
}


