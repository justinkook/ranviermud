import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { exportChapters } from './export';

describe('exportChapters', () => {
  it('creates a chapters.md from a simple transcript', () => {
    const base = path.resolve(__dirname, '..', '..', 'sessions', 'test-export');
    fs.mkdirSync(base, { recursive: true });
    const transcript = [
      { t: new Date().toISOString(), type: 'command', text: 'look' },
      { t: new Date().toISOString(), type: 'narration', text: 'You are in a room.' },
      { t: new Date().toISOString(), type: 'chapter_break', text: '---' },
      { t: new Date().toISOString(), type: 'command', text: 'north' },
      { t: new Date().toISOString(), type: 'narration', text: 'A corridor stretches ahead.' },
    ];
    fs.writeFileSync(path.join(base, 'transcript.ndjson'), transcript.map(j => JSON.stringify(j)).join('\n') + '\n');
    fs.writeFileSync(path.join(base, 'story.md'), 'story');

    const out = exportChapters('test-export', 2);
    expect(fs.existsSync(out)).toBe(true);
    const content = fs.readFileSync(out, 'utf8');
    expect(content).toContain('Chapter 1');
    expect(content).toContain('Chapter 2');
  });
});


