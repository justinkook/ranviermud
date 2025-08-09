export interface SeedCharacter {
  name: string;
  traits?: string[];
  summary?: string;
}

export interface SeedWorld {
  title?: string;
  tone?: string;
  synopsis?: string;
}

export interface SeedData {
  world?: SeedWorld;
  characters?: SeedCharacter[];
  canon?: { references?: string[] };
}

export interface GhostwriterInput {
  playerName: string;
  roomId?: string | null;
  lastCommand?: string;
  transcriptTail?: string;
  seed: SeedData;
  stateSnapshot: unknown;
  canonSnippets?: string[];
}

export interface GhostwriterOutput {
  narration: string;
  choices?: string[];
}

export interface GhostwriterProvider {
  generate(input: GhostwriterInput): Promise<GhostwriterOutput>;
}

export class LocalGhostwriter implements GhostwriterProvider {
  async generate(input: GhostwriterInput): Promise<GhostwriterOutput> {
    const title = input.seed.world?.title || 'Untitled World';
    const tone = input.seed.world?.tone || 'adventurous';
    const player = input.playerName;
    const room = input.roomId || 'somewhere unfamiliar';

    const characterSnippet = (input.seed.characters || [])
      .slice(0, 3)
      .map(c => c.name)
      .join(', ');

    const preface = input.lastCommand
      ? `After the command "${input.lastCommand}", `
      : '';

    const narration = [
      `${preface}${player} stands in ${room}.`,
      `In the ${tone} world of ${title}, the air is thick with possibility.`,
      characterSnippet ? `Nearby figures linger: ${characterSnippet}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const choices: string[] = this.generateChoices(input.lastCommand);
    return { narration, choices };
  }

  private generateChoices(lastCommand?: string): string[] {
    const base = ['look', 'inventory', 'say hello', 'think', 'north', 'south', 'east', 'west'];
    if (!lastCommand) return base.slice(0, 4);
    // Simple variation to avoid repeating the exact last command if present
    return base.filter(c => c !== lastCommand).slice(0, 4);
  }
}


