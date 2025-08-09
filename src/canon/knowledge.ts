import fs from 'fs';
import path from 'path';

export interface CanonDoc {
  id: string;
  filePath: string;
  text: string;
}

export interface CanonIndex {
  docs: CanonDoc[];
}

export function loadCanon(canonPath?: string): CanonIndex {
  const base = canonPath && path.isAbsolute(canonPath)
    ? canonPath
    : path.resolve(__dirname, '..', '..', canonPath || 'canon');

  const docs: CanonDoc[] = [];
  if (!fs.existsSync(base)) {
    return { docs };
  }

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (/\.(md|markdown|txt|json)$/i.test(entry)) {
        try {
          let text = fs.readFileSync(full, 'utf8');
          if (/\.json$/i.test(entry)) {
            try { text = JSON.stringify(JSON.parse(text), null, 2); } catch {}
          }
          docs.push({ id: `${docs.length}`, filePath: full, text });
        } catch {}
      }
    }
  };

  walk(base);
  return { docs };
}

export function searchCanon(index: CanonIndex, query: string, topK = 3): string[] {
  if (!query || !index.docs.length) return [];
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!terms.length) return [];

  const scored = index.docs.map(doc => {
    const lower = doc.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const matches = lower.split(t).length - 1;
      score += matches;
    }
    return { doc, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(s => extractSnippet(s.doc.text, terms));
}

function extractSnippet(text: string, terms: string[], window = 400): string {
  const lower = text.toLowerCase();
  let bestIdx = 0;
  let bestCount = -1;
  for (let i = 0; i < lower.length; i += Math.max(1, Math.floor(window / 2))) {
    const segment = lower.slice(i, i + window);
    const count = terms.reduce((acc, t) => acc + (segment.split(t).length - 1), 0);
    if (count > bestCount) {
      bestCount = count;
      bestIdx = i;
    }
  }
  return text.slice(bestIdx, bestIdx + window).trim();
}


