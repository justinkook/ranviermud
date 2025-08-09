import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { SeedData } from '../ai/ghostwriter';

function toString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function loadTextSafe(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
  } catch {}
  return '';
}

function parseCharactersYaml(filePath: string): SeedData['characters'] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = YAML.parse(raw);
    const result: NonNullable<SeedData['characters']> = [];
    if (Array.isArray(data)) {
      for (const entry of data) {
        const name = toString((entry && (entry.name || entry.id || entry.title)) || '').trim();
        if (!name) continue;
        const traits = Array.isArray(entry?.traits) ? entry.traits.map(toString) : [];
        const summary = toString(entry?.summary || entry?.description || entry?.bio || '').trim();
        result.push({ name, traits, summary });
      }
    } else if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries<any>(data)) {
        const name = toString(value?.name || key).trim();
        if (!name) continue;
        const traits = Array.isArray(value?.traits) ? value.traits.map(toString) : [];
        const summary = toString(value?.summary || value?.description || value?.bio || '').trim();
        result.push({ name, traits, summary });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function parseYamlList(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = YAML.parse(raw);
    const names: string[] = [];
    if (Array.isArray(data)) {
      for (const entry of data) {
        const n = toString(entry?.name || entry?.title || entry?.id || entry).trim();
        if (n) names.push(n);
      }
    } else if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries<any>(data)) {
        const n = toString(value?.name || value?.title || key).trim();
        if (n) names.push(n);
      }
    }
    return names;
  } catch {
    return [];
  }
}

export function buildCompositeSeedFromDir(dir: string): SeedData {
  const info = loadTextSafe(path.join(dir, 'info.txt')).trim();
  const timeline = loadTextSafe(path.join(dir, 'timeline.txt')).trim();
  const synopsis = [info, timeline ? `Timeline:\n${timeline}` : ''].filter(Boolean).join('\n\n');

  // Characters
  const charsFile = path.join(dir, 'Characters.yaml');
  const characters = parseCharactersYaml(charsFile);

  // Optional references from lists
  const items = parseYamlList(path.join(dir, 'Items.yaml'));
  const quests = parseYamlList(path.join(dir, 'Quests.yaml'));

  // Location files (*.yaml) -> names from filename
  const locationFiles = fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.yaml') && f !== 'Characters.yaml' && f !== 'Items.yaml' && f !== 'Quests.yaml');
  const locations = locationFiles.map(f => path.parse(f).name);

  const seed: SeedData = {
    world: {
      title: process.env.SEED_WORLD_TITLE || 'Fanfic World',
      tone: process.env.SEED_WORLD_TONE || 'adventurous, character-driven',
      synopsis: synopsis || undefined,
    },
    characters,
    canon: {
      references: [...new Set<string>([...items, ...quests, ...locations])]
    }
  };
  return seed;
}

export function loadSeed(seedPath?: string): SeedData {
  const baseDir = path.resolve(__dirname, '..', '..');
  const defaultSeedDir = path.join(baseDir, 'seeds');
  const defaultSeedFile = path.join(defaultSeedDir, 'seed.json');

  let resolved: string | undefined = seedPath;

  if (!resolved) {
    if (fs.existsSync(defaultSeedFile)) {
      resolved = defaultSeedFile;
    }
  } else if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(process.cwd(), resolved);
  }

  if (resolved && fs.existsSync(resolved)) {
    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        return buildCompositeSeedFromDir(resolved);
      }
      const ext = path.extname(resolved).toLowerCase();
      if (ext === '.json') {
        const raw = fs.readFileSync(resolved, 'utf8');
        return JSON.parse(raw) as SeedData;
      }
      // Fallback: try directory of the file
      return buildCompositeSeedFromDir(path.dirname(resolved));
    } catch {
      return {} as SeedData;
    }
  }

  // Fallback minimal seed
  return {
    world: {
      title: 'Seedless Realm',
      tone: 'exploratory',
      synopsis: 'A placeholder world used when no seed is provided.'
    },
    characters: [
      { name: 'Narrator', summary: 'An impartial observer.' }
    ]
  };
}

export function validateSeed(seed: SeedData): string[] {
  const warnings: string[] = [];
  if (!seed) {
    warnings.push('Seed is empty. Using defaults.');
    return warnings;
  }

  if (seed.world && typeof seed.world !== 'object') {
    warnings.push('world should be an object.');
  }
  if (seed.world?.title && typeof seed.world.title !== 'string') {
    warnings.push('world.title should be a string.');
  }
  if (seed.world?.tone && typeof seed.world.tone !== 'string') {
    warnings.push('world.tone should be a string.');
  }

  if (seed.characters && !Array.isArray(seed.characters)) {
    warnings.push('characters should be an array.');
  } else if (Array.isArray(seed.characters)) {
    seed.characters.forEach((c, i) => {
      if (!c || typeof c !== 'object') warnings.push(`characters[${i}] should be an object.`);
      if (!c?.name || typeof c.name !== 'string') warnings.push(`characters[${i}].name should be a non-empty string.`);
      if (c?.traits && !Array.isArray(c.traits)) warnings.push(`characters[${i}].traits should be an array of strings.`);
    });
  }

  return warnings;
}


