import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { buildCompositeSeedFromDir } from '../seeds/loader';

async function main() {
  dotenv.config();
  const dir = process.argv[2] || process.env.SEED_PATH || path.resolve(__dirname, '..', '..', 'seeds');
  const out = process.argv[3] || path.resolve(dir, 'seed.json');
  const seed = buildCompositeSeedFromDir(dir);
  fs.writeFileSync(out, JSON.stringify(seed, null, 2));
  // eslint-disable-next-line no-console
  console.log(`Wrote seed to ${out}`);
}

main().catch(err => { console.error(err); process.exit(1); });


