require('dotenv').config();

const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const config = require('./config');
const { setSetting } = require('./database');
const { closeWeek } = require('./utils/weekClose');
const {
  postNewWeekMessage,
  postMidweekCheckpoint,
  postPushDayMorning,
  postPushDayEvening,
  sendFinalPushDMs,
} = require('./utils/scheduledMessages');
const { runAutoImport } = require('./utils/umaImport');

// --- Load commands ---
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

const commands = new Collection();
const commandData = [];

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.set(command.data.name, command);
  commandData.push(command.data.toJSON());
}

// --- Register slash commands with Discord ---
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    console.log(`Registering ${commandData.length} slash command(s)...`);
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commandData }
    );
    console.log('Slash commands registered successfully.');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
}

// --- Create Discord client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();

  // Persist the guild ID in settings so weekClose can fetch the guild
  if (config.guildId) {
    setSetting('guild_id', config.guildId);
  }

  // Helper: run auto-import and persist results
  async function doAutoImport(source) {
    console.log(`Auto-import [${source}]: running...`);
    try {
      const result = await runAutoImport();
      console.log(`Auto-import [${source}]: ${result.imported} imported, ${result.skipped} skipped, ${result.unmatched.length} unmatched`);
      setSetting('last_import_time', new Date().toISOString());
      setSetting('last_import_result', JSON.stringify(result));
    } catch (err) {
      console.error(`Auto-import [${source}] failed:`, err);
    }
  }

  // 30 s after boot — quick import with whatever data uma.moe has right now
  setTimeout(() => doAutoImport('boot-30s'), 30 * 1000);

  // 3 h after boot — fresh data should be available by then
  setTimeout(() => doAutoImport('boot-3h'), 3 * 60 * 60 * 1000);

  // Monday 03:55 JST — Week close + report + roles (5 min before Uma reset)
  cron.schedule('55 3 * * 1', async () => {
    console.log('Cron: running automatic week close (Monday 03:55 JST)...');
    try {
      await closeWeek(client);
    } catch (err) {
      console.error('Cron: week close failed:', err);
    }
  }, { timezone: 'Asia/Tokyo' });

  // Monday 04:05 JST — New week announcement (5 min after Uma reset)
  cron.schedule('5 4 * * 1', async () => {
    console.log('Cron: new week started (Monday 04:05 JST)');
    try {
      await postNewWeekMessage(client);
    } catch (err) {
      console.error('Cron: week start message failed:', err);
    }
  }, { timezone: 'Asia/Tokyo' });

  // Thursday 12:00 JST — Midweek checkpoint + DMs
  cron.schedule('0 12 * * 4', async () => {
    console.log('Cron: midweek checkpoint (Thursday 12:00 JST)');
    try {
      await postMidweekCheckpoint(client);
    } catch (err) {
      console.error('Cron: midweek checkpoint failed:', err);
    }
  }, { timezone: 'Asia/Tokyo' });

  // Sunday 10:00 JST — Push Day morning
  cron.schedule('0 10 * * 0', async () => {
    console.log('Cron: push day morning (Sunday 10:00 JST)');
    try {
      await postPushDayMorning(client);
    } catch (err) {
      console.error('Cron: push day morning failed:', err);
    }
  }, { timezone: 'Asia/Tokyo' });

  // Sunday 18:00 JST — Push Day evening
  cron.schedule('0 18 * * 0', async () => {
    console.log('Cron: push day evening (Sunday 18:00 JST)');
    try {
      await postPushDayEvening(client);
    } catch (err) {
      console.error('Cron: push day evening failed:', err);
    }
  }, { timezone: 'Asia/Tokyo' });

  // Monday 02:00 JST — Final push DMs (~2h before reset)
  cron.schedule('0 2 * * 1', async () => {
    console.log('Cron: final push DMs (Monday 02:00 JST)');
    try {
      await sendFinalPushDMs(client);
    } catch (err) {
      console.error('Cron: final push DMs failed:', err);
    }
  }, { timezone: 'Asia/Tokyo' });

  // Every 6 hours — Auto-import from uma.moe (catches all timezone edge cases)
  cron.schedule('0 */6 * * *', async () => {
    await doAutoImport('cron-6h');
  }, { timezone: 'Asia/Tokyo' });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const reply = { content: '❌ An error occurred while running this command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.login(config.token);
