# AGENTS

## Overview
This repository hosts a single-player, terminal-based storytelling engine built on the RanvierMUD core.

## Code Style
- Write new code in TypeScript under `src/`.
- Prefer async/await and modern ES2020 features.
- Avoid adding unnecessary dependencies.

## Testing
- Run `npm test` and make a best effort to ensure it passes (currently there are no tests and the command will report a missing script).
- Run a basic smoke check with `npm start` when modifying the CLI.

## Commands
- `npm start` launches the text-only game loop via `ts-node`.
- Networking features are disabled; the engine is single-player and terminal-only.

## Notes
- Use the filesystem for persistence; no database or network server should be introduced.
