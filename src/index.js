require('dotenv').config();

const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const config = require('./config');
const { setSetting } = require('./database');
const { closeWeek } = require('./utils/weekClose');

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

  // Schedule automatic week close every Sunday at 23:00 Europe/Madrid
  cron.schedule('0 23 * * 0', async () => {
    console.log('Cron: running automatic week close (Sunday 23:00 Europe/Madrid)...');
    try {
      await closeWeek(client);
    } catch (err) {
      console.error('Cron: week close failed:', err);
    }
  }, { timezone: 'Europe/Madrid' });
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
