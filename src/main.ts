import readline from 'readline';
import { initGameState } from './init';

async function main() {
  const state = await initGameState();
  const account = await state.AccountManager.loadAccount('Admin');
  const player = await state.PlayerManager.loadPlayer(state, account, 'Admin');

  player.socket = {
    writable: true,
    _prompted: false,
    write: (data: string) => process.stdout.write(data),
    end: () => process.exit(0),
    command: () => {}
  };

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('> ');

  const look = state.CommandManager.get('look');
  if (look) {
    await look.execute('', player);
  }
  rl.prompt();

  rl.on('line', async line => {
    const input = line.trim();
    if (input === 'quit') {
      console.log('Goodbye.');
      rl.close();
      return;
    }
    const [commandName, ...argsArr] = input.split(' ');
    const command = state.CommandManager.get(commandName) || state.CommandManager.find(commandName);
    if (!command) {
      console.log('Unknown command.');
    } else {
      await command.execute(argsArr.join(' '), player);
    }
    rl.prompt();
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
