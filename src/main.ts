import readline from 'readline';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { initGameState } from './init';
import { loadSeed, validateSeed } from './seeds/loader';
import { LocalGhostwriter } from './ai/ghostwriter';
import { OpenAICompatibleProvider } from './ai/providers';
import { loadCanon, searchCanon } from './canon/knowledge';
import { loadIndex as loadEmbedIndex, searchIndex as searchEmbedIndex } from './memory/embeddings';
import { exportChapters, maybeSummarizeChapters } from './tools/export';

async function main() {
  dotenv.config();
  const state = await initGameState();

  // Prepare session directory for logs and snapshots
  const sessionsRoot = path.resolve(__dirname, '..', 'sessions');
  if (!fs.existsSync(sessionsRoot)) fs.mkdirSync(sessionsRoot);
  const sessionId = (process.env.SESSION_ID && process.env.SESSION_ID.trim()) || new Date().toISOString().replace(/[:.]/g, '-');
  const sessionDir = path.join(sessionsRoot, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const storyLogPath = path.join(sessionDir, 'story.md');
  const transcriptPath = path.join(sessionDir, 'transcript.ndjson');
  let stepCounter = 0;
  let lastChoices: string[] = [];
  let bookmarkCounter = 0;

  const appendToFile = (filePath: string, content: string) => {
    fs.appendFileSync(filePath, content);
  };

  const snapshotState = () => {
    try {
      const snapshotFile = path.join(sessionDir, `state.step-${String(stepCounter).padStart(4, '0')}.json`);
      // Prefer serialize() if available, fall back to minimal fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerAny: any = player;
      let data: unknown;
      if (playerAny && typeof playerAny.serialize === 'function') {
        data = playerAny.serialize();
      } else {
        data = {
          name: playerAny?.name,
          room: playerAny?.room?.entityReference || playerAny?.room?.id || null,
          attributes: playerAny?.attributes || null,
          inventory: playerAny?.inventory || null,
          meta: playerAny?.metadata || null,
        };
      }
      fs.writeFileSync(snapshotFile, JSON.stringify(data, null, 2));
    } catch {
      // Best-effort snapshotting; ignore errors for now
    }
  };

  const getTranscriptTail = (maxLines = 20): string => {
    try {
      if (!fs.existsSync(transcriptPath)) return '';
      const content = fs.readFileSync(transcriptPath, 'utf8').trim();
      if (!content) return '';
      const envLines = Number(process.env.AI_TRANSCRIPT_TAIL_LINES || maxLines);
      const lines = content.split('\n');
      const tail = lines.slice(-maxLines).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean) as Array<{ type?: string; text?: string; choices?: string[] }>;
      const text = tail.map(ev => {
        if (ev?.type === 'command') return `> ${ev.text}`;
        if (ev?.type === 'narration') return ev.text || '';
        if (ev?.type === 'output') return ev.text || '';
        return '';
      }).filter(Boolean).join('\n');
      const charLimit = Number(process.env.AI_TRANSCRIPT_TAIL_CHARS || 2000);
      const clipped = text.length > charLimit ? text.slice(-charLimit) : text;
      return envLines !== maxLines ? clipped : clipped;
    } catch {
      return '';
    }
  };

  const account = await state.AccountManager.loadAccount('Admin');
  const player = await state.PlayerManager.loadPlayer(state, account, 'Admin');

  let seed = loadSeed(process.env.SEED_PATH);
  const seedWarnings = validateSeed(seed);
  if (seedWarnings.length) {
    // eslint-disable-next-line no-console
    console.warn('[seed] warnings:', seedWarnings.join(' | '));
  }
  const providerChoice = (process.env.AI_PROVIDER || 'local').toLowerCase();
  const ghostwriter = providerChoice === 'openai'
    ? new OpenAICompatibleProvider({})
    : providerChoice === 'lmstudio'
    ? new OpenAICompatibleProvider({ baseURL: process.env.OPENAI_BASE_URL || 'http://localhost:1234/v1', apiKey: process.env.OPENAI_API_KEY || 'lm-studio' })
    : providerChoice === 'ollama'
    ? new OpenAICompatibleProvider({ baseURL: process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1', apiKey: process.env.OPENAI_API_KEY || 'ollama' })
    : new LocalGhostwriter();

  let canonIndex = loadCanon(process.env.CANON_PATH);
  const embedIndexPath = path.resolve(process.env.CANON_PATH || path.resolve(__dirname, '..', 'canon'), 'embeddings.index.json');
  let embedIndex = loadEmbedIndex(embedIndexPath);

  // Wrap socket writes to both display and log to story
  player.socket = {
    writable: true,
    _prompted: false,
    write: (data: string) => {
      appendToFile(storyLogPath, data);
      process.stdout.write(data);
    },
    end: () => process.exit(0),
    command: () => {}
  };

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('> ');

  const look = state.CommandManager.get('look');
  if (look) {
    await look.execute('', player);
  }
  // Initial narration from ghostwriter
  try {
    const dynamicCanon = (process.env.CANON_DYNAMIC || 'true').toLowerCase() !== 'false';
    const canonQuery = process.env.CANON_QUERY || seed.world?.title || '';
    const textSnippets = dynamicCanon && canonQuery ? searchCanon(canonIndex, canonQuery, 2) : [];
    const embedSnippets = (embedIndex && canonQuery)
      ? (await searchEmbedIndex(embedIndex, canonQuery, 1)).map(d => d.text)
      : [];
    const canonSnippets = [...textSnippets, ...embedSnippets];
    const gw = await ghostwriter.generate({
      playerName: player.name,
      roomId: player?.room?.entityReference || player?.room?.id || null,
      transcriptTail: getTranscriptTail(),
      seed,
      stateSnapshot: {},
      canonSnippets,
    });
    const intro = `\n${gw.narration}` + (gw.choices?.length ? `\nChoices: ${gw.choices.join(' | ')}` : '') + '\n';
    appendToFile(storyLogPath, intro);
    process.stdout.write(intro);
    lastChoices = gw.choices || [];
  } catch {}
  rl.prompt();

  rl.on('line', async line => {
    const input = line.trim();
    const time = new Date().toISOString();

    if (input === 'quit') {
      console.log('Goodbye.');
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'command', text: input }) + '\n');
      appendToFile(storyLogPath, `\n\n> ${input}\n`);
      rl.close();
      return;
    }

    if (input === 'help' || input === '?') {
      const provider = providerChoice;
      const choicesList = lastChoices.map((c, i) => `${i + 1}. ${c}`).join('\n');
      const msg = `Provider: ${provider}\nCommands: help, chapter, save, narrate <text>, note <text>, bookmark <label>, research <query>, canon <query>, export-chapters, reload-canon, reload-seed, set-seed <absPath>, quit\nNumeric choices: type 1..N to pick from the last AI-suggested choices.\n${choicesList ? `\nLast choices:\n${choicesList}` : ''}`;
      console.log(msg);
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'output', text: msg }) + '\n');
      rl.prompt();
      return;
    }

    if (input === 'chapter') {
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'chapter_break', text: '---' }) + '\n');
      appendToFile(storyLogPath, `\n\n# Chapter Break\n\n`);
      console.log('(chapter break)');
      rl.prompt();
      return;
    }

    if (input === 'save') {
      stepCounter += 1;
      snapshotState();
      const msg = '(saved snapshot)';
      console.log(msg);
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'output', text: msg }) + '\n');
      rl.prompt();
      return;
    }

    if (input === 'reload-canon') {
      canonIndex = loadCanon(process.env.CANON_PATH);
      embedIndex = loadEmbedIndex(embedIndexPath);
      const msg = `(canon reloaded: ${canonIndex.docs.length} docs)`;
      console.log(msg);
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'output', text: msg }) + '\n');
      rl.prompt();
      return;
    }

    if (input.startsWith('canon ')) {
      const q = input.slice('canon '.length).trim();
      const textSnippets = searchCanon(canonIndex, q, 2);
      const embedSnippets = embedIndex ? (await searchEmbedIndex(embedIndex, q, 2)).map(d => `(${d.source}@${d.offset}) ${d.text.slice(0, 200)}...`) : [];
      const msg = [`Canon results for: ${q}`, ...textSnippets, ...embedSnippets].join('\n');
      console.log(msg);
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'output', text: msg }) + '\n');
      rl.prompt();
      return;
    }

    if (input === 'reload-seed') {
      seed = loadSeed(process.env.SEED_PATH);
      const warnings = validateSeed(seed);
      if (warnings.length) console.warn('[seed] warnings:', warnings.join(' | '));
      console.log('(seed reloaded)');
      rl.prompt();
      return;
    }

    if (input.startsWith('set-seed ')) {
      const p = input.slice('set-seed '.length).trim();
      if (p) process.env.SEED_PATH = p;
      seed = loadSeed(process.env.SEED_PATH);
      const warnings = validateSeed(seed);
      if (warnings.length) console.warn('[seed] warnings:', warnings.join(' | '));
      console.log(`(seed set to ${process.env.SEED_PATH || ''})`);
      rl.prompt();
      return;
    }

    if (input.startsWith('research ')) {
      const query = input.slice('research '.length).trim();
      const { researchAndIngest } = await import('./research/agent');
      const { searchWeb } = await import('./research/search');
      const outDir = process.env.CANON_PATH || path.resolve(__dirname, '..', 'canon');
      let urls: string[] = [];
      const webNum = Number(process.env.RESEARCH_WEB_RESULTS || 5);
      if (webNum && webNum > 0 && process.env.TAVILY_API_KEY) {
        const results = await searchWeb(query, webNum);
        urls = results.map(r => r.url);
      }
      const res = await researchAndIngest({ outDir, query, urls, maxPages: 5, summarize: true });
      const msg = `(research done: ${res.written.length} files)`;
      console.log(msg);
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'output', text: msg }) + '\n');
      // Reload canon after ingest
      canonIndex = loadCanon(process.env.CANON_PATH);
      rl.prompt();
      return;
    }

    if (input.startsWith('note ')) {
      const note = input.slice('note '.length).trim();
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'note', text: note }) + '\n');
      console.log('(noted)');
      rl.prompt();
      return;
    }

    if (input.startsWith('bookmark')) {
      const label = input.replace(/^bookmark\s*/, '').trim() || `mark-${bookmarkCounter + 1}`;
      bookmarkCounter += 1;
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'bookmark', text: label }) + '\n');
      appendToFile(storyLogPath, `\n\n[Bookmark] ${label}\n`);
      // Touch a bookmark file for quick navigation
      const safe = label.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      try { fs.writeFileSync(path.join(sessionDir, `bookmark-${String(bookmarkCounter).padStart(3, '0')}-${safe}.txt`), label); } catch {}
      console.log('(bookmark added)');
      rl.prompt();
      return;
    }

    if (input === 'export-chapters') {
      const steps = Number(process.env.CHAPTER_EVERY_STEPS || 50);
      const out = exportChapters(sessionId, Number.isFinite(steps) ? steps : 50);
      await maybeSummarizeChapters(out);
      const msg = `(exported to ${out})`;
      console.log(msg);
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'output', text: msg }) + '\n');
      rl.prompt();
      return;
    }

    appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'command', text: input }) + '\n');
    appendToFile(storyLogPath, `\n\n> ${input}\n`);

    // Numeric choice mapping
    const numericMatch = input.match(/^([1-9][0-9]*)$/);
    if (numericMatch && lastChoices.length) {
      const idx = Number(numericMatch[1]) - 1;
      if (idx >= 0 && idx < lastChoices.length) {
        const choice = lastChoices[idx];
        appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'command', text: choice }) + '\n');
        appendToFile(storyLogPath, `\n\n> ${choice}\n`);
        // Reassign input to mapped choice
        line = choice;
      }
    }

    let narrationOverride: string | null = null;
    if (input.startsWith('narrate ')) {
      narrationOverride = input.slice('narrate '.length).trim();
    }

    const [commandName, ...argsArr] = line.split(' ');
    const command = state.CommandManager.get(commandName) || state.CommandManager.find(commandName);
    if (!command && !narrationOverride) {
      const msg = 'Unknown command.';
      console.log(msg);
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'output', text: msg }) + '\n');
    } else if (command) {
      try {
        await command.execute(argsArr.join(' '), player);
      } catch (err) {
        const errMsg = `Error executing command: ${(err as Error).message}`;
        console.error(errMsg);
        appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'error', text: errMsg }) + '\n');
      }
    }

    stepCounter += 1;
    snapshotState();

    const autoChapterEvery = Number(process.env.AUTO_CHAPTER_EVERY || 0);
    if (autoChapterEvery > 0 && stepCounter % autoChapterEvery === 0) {
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'chapter_break', text: '--- (auto)' }) + '\n');
      appendToFile(storyLogPath, `\n\n# Chapter Break (auto)\n\n`);
    }

    // Ghostwriter responds to the last command
    try {
      const dynamicCanon = (process.env.CANON_DYNAMIC || 'true').toLowerCase() !== 'false';
      const canonQuery = process.env.CANON_QUERY || (narrationOverride ? narrationOverride : input);
      const textSnippets = dynamicCanon && canonQuery ? searchCanon(canonIndex, canonQuery, 2) : [];
      const embedSnippets = (embedIndex && canonQuery)
        ? (await searchEmbedIndex(embedIndex, canonQuery, 1)).map(d => d.text)
        : [];
      const canonSnippets = [...textSnippets, ...embedSnippets];
      const gw = await ghostwriter.generate({
        playerName: player.name,
        roomId: player?.room?.entityReference || player?.room?.id || null,
        lastCommand: narrationOverride || input,
        transcriptTail: getTranscriptTail(),
        seed,
        stateSnapshot: {},
        canonSnippets,
      });
      const numbered = gw.choices?.map((c, i) => `${i + 1}) ${c}`) || [];
      const out = `\n${gw.narration}` + (numbered.length ? `\nChoices: ${numbered.join(' | ')}` : '') + '\n';
      appendToFile(transcriptPath, JSON.stringify({ t: time, type: 'narration', text: gw.narration, choices: gw.choices }) + '\n');
      appendToFile(storyLogPath, out);
      process.stdout.write(out);
      lastChoices = gw.choices || [];
    } catch {}
    rl.prompt();
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
