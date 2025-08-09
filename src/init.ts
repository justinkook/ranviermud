import path from 'path';
import fs from 'fs';

const Ranvier: any = require('ranvier');

export async function initGameState() {
  const Logger = Ranvier.Logger;
  const Config = Ranvier.Config;
  const root = path.resolve(__dirname, '..');

  Ranvier.Data.setDataPath(path.join(root, 'data'));
  const confJs = path.join(root, 'ranvier.conf.js');
  const confJson = path.join(root, 'ranvier.json');
  if (fs.existsSync(confJs)) {
    Config.load(require(confJs));
  } else if (fs.existsSync(confJson)) {
    Config.load(require(confJson));
  } else {
    throw new Error('No ranvier.json or ranvier.conf.js found');
  }

  const GameState: any = {
    AccountManager: new Ranvier.AccountManager(),
    AreaBehaviorManager: new Ranvier.BehaviorManager(),
    AreaFactory: new Ranvier.AreaFactory(),
    AreaManager: new Ranvier.AreaManager(),
    AttributeFactory: new Ranvier.AttributeFactory(),
    ChannelManager: new Ranvier.ChannelManager(),
    CommandManager: new Ranvier.CommandManager(),
    Config,
    EffectFactory: new Ranvier.EffectFactory(),
    HelpManager: new Ranvier.HelpManager(),
    InputEventManager: new Ranvier.EventManager(),
    ItemBehaviorManager: new Ranvier.BehaviorManager(),
    ItemFactory: new Ranvier.ItemFactory(),
    ItemManager: new Ranvier.ItemManager(),
    MobBehaviorManager: new Ranvier.BehaviorManager(),
    MobFactory: new Ranvier.MobFactory(),
    MobManager: new Ranvier.MobManager(),
    PartyManager: new Ranvier.PartyManager(),
    PlayerManager: new Ranvier.PlayerManager(),
    QuestFactory: new Ranvier.QuestFactory(),
    QuestGoalManager: new Ranvier.QuestGoalManager(),
    QuestRewardManager: new Ranvier.QuestRewardManager(),
    RoomBehaviorManager: new Ranvier.BehaviorManager(),
    RoomFactory: new Ranvier.RoomFactory(),
    RoomManager: new Ranvier.RoomManager(),
    SkillManager: new Ranvier.SkillManager(),
    SpellManager: new Ranvier.SkillManager(),
    ServerEventManager: new Ranvier.EventManager(),
    GameServer: new Ranvier.GameServer(),
    DataLoader: Ranvier.Data,
    EntityLoaderRegistry: new Ranvier.EntityLoaderRegistry(),
    DataSourceRegistry: new Ranvier.DataSourceRegistry(),
  };

  GameState.DataSourceRegistry.load(require, root, Config.get('dataSources'));
  GameState.EntityLoaderRegistry.load(GameState.DataSourceRegistry, Config.get('entityLoaders'));
  GameState.AccountManager.setLoader(GameState.EntityLoaderRegistry.get('accounts'));
  GameState.PlayerManager.setLoader(GameState.EntityLoaderRegistry.get('players'));

  // Ensure trailing slash for compatibility with Ranvier's BundleManager path concatenation
  const BundleManager = new Ranvier.BundleManager(path.join(root, 'bundles') + '/', GameState);
  GameState.BundleManager = BundleManager;
  await BundleManager.loadBundles();
  GameState.ServerEventManager.attach(GameState.GameServer);

  setInterval(() => {
    GameState.AreaManager.tickAll(GameState);
    GameState.ItemManager.tickAll();
  }, Config.get('entityTickFrequency', 100));

  setInterval(() => {
    GameState.PlayerManager.emit('updateTick');
  }, Config.get('playerTickFrequency', 100));

  Logger.setLevel(process.env.LOG_LEVEL || Config.get('logLevel') || 'debug');
  return GameState;
}
