import OpenAI from 'openai';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import type { GhostwriterInput, GhostwriterOutput, GhostwriterProvider } from './ghostwriter';

// Provider using OpenAI SDK with configurable baseURL to support:
// - OpenAI hosted (default)
// - LM Studio (set baseURL to http://localhost:1234/v1)
// - Ollama (set baseURL to http://localhost:11434/v1)
export class OpenAICompatibleProvider implements GhostwriterProvider {
  private client: OpenAI;
  private model: string;

  constructor(opts?: { apiKey?: string; baseURL?: string; model?: string }) {
    this.client = new OpenAI({
      apiKey: opts?.apiKey || process.env.OPENAI_API_KEY || 'sk-local',
      baseURL: opts?.baseURL || process.env.OPENAI_BASE_URL,
    });
    this.model = opts?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  async generate(input: GhostwriterInput): Promise<GhostwriterOutput> {
    const maxRetries = Number(process.env.AI_RETRIES || 2);
    const temperature = Number.isFinite(Number(process.env.AI_TEMPERATURE))
      ? Number(process.env.AI_TEMPERATURE)
      : 0.7;
    let attempt = 0;
    let lastError: unknown;

    const system = buildSystemPrompt(input.seed, input.canonSnippets);
    const user = buildUserPrompt({
      playerName: input.playerName,
      roomId: input.roomId,
      lastCommand: input.lastCommand,
      transcriptTail: input.transcriptTail,
    });

    while (attempt <= maxRetries) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature,
          response_format: { type: 'json_object' } as any,
        });

        const content = completion.choices?.[0]?.message?.content || '{}';
        try {
          const parsed = JSON.parse(content) as { narration?: string; choices?: string[] };
          return {
            narration: parsed.narration || '',
            choices: parsed.choices && Array.isArray(parsed.choices) ? parsed.choices : [],
          };
        } catch (e) {
          // attempt to salvage JSON
          const match = content.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]) as { narration?: string; choices?: string[] };
              return {
                narration: parsed.narration || '',
                choices: parsed.choices && Array.isArray(parsed.choices) ? parsed.choices : [],
              };
            } catch {}
          }
          throw e;
        }
      } catch (err) {
        lastError = err;
        attempt += 1;
        if (attempt > maxRetries) break;
        await new Promise(r => setTimeout(r, 300 * attempt));
      }
    }

    // Fallback empty output on failure
    return { narration: '', choices: [] };
  }
}


