import type { SeedData } from './ghostwriter';

export function buildSystemPrompt(seed: SeedData, canonSnippets?: string[]): string {
  const title = seed.world?.title || 'Untitled World';
  const tone = seed.world?.tone || 'adventurous';
  const synopsis = seed.world?.synopsis || '';
  const cast = (seed.characters || []).map(c => `- ${c.name}${c.traits?.length ? ` (${c.traits.join(', ')})` : ''}${c.summary ? ` — ${c.summary}` : ''}`).join('\n');

  return [
    `You are an expert Game Master and ghostwriter for a single-player, text-only RPG.`,
    `World: ${title}`,
    `Tone: ${tone}`,
    synopsis ? `Synopsis: ${synopsis}` : '',
    cast ? `Characters:\n${cast}` : '',
    canonSnippets && canonSnippets.length ? `Canon context (snippets):\n- ${canonSnippets.join('\n- ')}` : '',
    `Rules:`,
    `- Keep narration concise (1-3 paragraphs) and forward-moving.`,
    `- Maintain internal consistency with provided world and characters.`,
    `- Offer 3-5 grounded next-action choices the player could take.`,
    `- Output MUST be strict JSON with keys: narration (string), choices (string[]).`,
  ].filter(Boolean).join('\n');
}

export function buildUserPrompt(params: {
  playerName: string;
  roomId?: string | null;
  lastCommand?: string;
  transcriptTail?: string;
}): string {
  const { playerName, roomId, lastCommand, transcriptTail } = params;
  return [
    lastCommand ? `Player command: ${lastCommand}` : 'Start of session',
    roomId ? `Current location: ${roomId}` : '',
    `Player: ${playerName}`,
    transcriptTail ? `Recent transcript:\n${transcriptTail}` : '',
    `Respond ONLY with JSON: {"narration": string, "choices": string[]}`,
  ].filter(Boolean).join('\n');
}


