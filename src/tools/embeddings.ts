import dotenv from 'dotenv';
import path from 'path';
import { indexDirectory, loadIndex, searchIndex } from '../memory/embeddings';

async function main() {
  dotenv.config();
  const args = process.argv.slice(2);
  // Usage: embeddings index <dir> <outIndex.json>
  //        embeddings search <index.json> <query> [topK]
  const cmd = args[0];
  if (cmd === 'index') {
    const dir = args[1] || (process.env.CANON_PATH || 'canon');
    const out = args[2] || path.resolve(dir, 'embeddings.index.json');
    const res = await indexDirectory(dir, out);
    // eslint-disable-next-line no-console
    console.log(res ? `Indexed ${res.docs.length} chunks -> ${out}` : 'Embedding not configured');
  } else if (cmd === 'search') {
    const indexPath = args[1] || path.resolve(process.env.CANON_PATH || 'canon', 'embeddings.index.json');
    const query = args[2] || '';
    const topK = args[3] ? parseInt(args[3], 10) : 3;
    const idx = loadIndex(indexPath);
    if (!idx) { console.error('No index found'); process.exit(2); }
    const res = await searchIndex(idx, query, topK);
    // eslint-disable-next-line no-console
    console.log(res.map(r => ({ source: r.source, offset: r.offset, score: undefined })).slice(0, topK));
  } else {
    // eslint-disable-next-line no-console
    console.log('Usage:\n  embeddings index <dir> <outIndex.json>\n  embeddings search <index.json> <query> [topK]');
  }
}

main().catch(err => { console.error(err); process.exit(1); });


