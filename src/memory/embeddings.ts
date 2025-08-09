import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

export interface EmbeddingDoc {
  id: string;
  source: string;
  offset: number;
  length: number;
  text: string;
  vector: number[];
}

export interface EmbeddingIndex {
  model: string;
  updatedAt: string;
  docs: EmbeddingDoc[];
}

export function loadIndex(indexPath: string): EmbeddingIndex | null {
  if (!fs.existsSync(indexPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf8')) as EmbeddingIndex;
  } catch {
    return null;
  }
}

export async function embedTexts(texts: string[], client: OpenAI, model: string): Promise<number[][]> {
  const res = await client.embeddings.create({ model, input: texts });
  return res.data.map(d => d.embedding as number[]);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export async function indexDirectory(dirPath: string, indexPath: string): Promise<EmbeddingIndex | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey, baseURL });

  const files: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (/\.(md|markdown|txt)$/i.test(entry)) files.push(full);
    }
  };
  walk(dirPath);

  const docs: EmbeddingDoc[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    // naive chunking by characters
    const chunkSize = Number(process.env.EMBED_CHARS || 1200);
    for (let offset = 0; offset < text.length; offset += chunkSize) {
      const chunk = text.slice(offset, offset + chunkSize);
      const vectors = await embedTexts([chunk], client, model);
      docs.push({
        id: `${path.basename(file)}:${offset}`,
        source: path.relative(dirPath, file),
        offset,
        length: chunk.length,
        text: chunk,
        vector: vectors[0],
      });
    }
  }

  const index: EmbeddingIndex = { model, updatedAt: new Date().toISOString(), docs };
  fs.writeFileSync(indexPath, JSON.stringify(index));
  return index;
}

export async function searchIndex(index: EmbeddingIndex, query: string, topK = 3): Promise<EmbeddingDoc[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_EMBED_MODEL || index.model || 'text-embedding-3-small';
  if (!apiKey) return [];
  const client = new OpenAI({ apiKey, baseURL });
  const [qvec] = await embedTexts([query], client, model);
  const scored = index.docs
    .map(d => ({ d, s: cosineSimilarity(d.vector, qvec) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topK)
    .map(x => x.d);
  return scored;
}


