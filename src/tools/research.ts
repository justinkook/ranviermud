import dotenv from 'dotenv';
import { researchAndIngest } from '../research/agent';
import { searchWeb } from '../research/search';

async function main() {
  dotenv.config();
  const args = process.argv.slice(2);
  // Usage: research <query> [--urls url1,url2] [--out canon] [--max 5] [--summarize] [--web N]
  let query: string | undefined;
  let urls: string[] = [];
  let outDir = process.env.CANON_PATH || 'canon';
  let maxPages = 5;
  let summarize = false;
  let webResults: number | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith('--') && !query) {
      query = a;
    } else if (a === '--urls') {
      const v = args[i + 1];
      if (v) urls = v.split(',').map(s => s.trim()).filter(Boolean);
      i += 1;
    } else if (a === '--out') {
      const v = args[i + 1];
      if (v) outDir = v;
      i += 1;
    } else if (a === '--max') {
      const v = args[i + 1];
      if (v && /^\d+$/.test(v)) maxPages = parseInt(v, 10);
      i += 1;
    } else if (a === '--summarize') {
      summarize = true;
    } else if (a === '--web') {
      const v = args[i + 1];
      if (v && /^\d+$/.test(v)) webResults = parseInt(v, 10);
      i += 1;
    }
  }

  if (query && webResults && webResults > 0) {
    const results = await searchWeb(query, webResults);
    const found = results.map(r => r.url);
    urls = [...urls, ...found];
  }

  const res = await researchAndIngest({ outDir, query, urls, maxPages, summarize });
  // eslint-disable-next-line no-console
  console.log(`Wrote ${res.written.length} files to ${outDir}`);
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});


