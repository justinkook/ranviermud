import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './prompt';

describe('prompt builders', () => {
  it('builds system prompt with seed and canon', () => {
    const p = buildSystemPrompt({ world: { title: 'X', tone: 'Y' }, characters: [{ name: 'A' }] }, ['canon1', 'canon2']);
    expect(p).toContain('World: X');
    expect(p).toContain('Tone: Y');
    expect(p).toContain('A');
    expect(p).toContain('canon1');
  });

  it('builds user prompt with tail', () => {
    const p = buildUserPrompt({ playerName: 'P', roomId: 'room', lastCommand: 'look', transcriptTail: 'hi' });
    expect(p).toContain('look');
    expect(p).toContain('room');
    expect(p).toContain('hi');
    expect(p).toContain('Respond ONLY with JSON');
  });
});


