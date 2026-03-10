require('dotenv').config();

const config = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  clientId: process.env.CLIENT_ID,

  thresholds: {
    min_fans: parseInt(process.env.MIN_FANS ?? '4200000', 10),
    target_fans: parseInt(process.env.TARGET_FANS ?? '4800000', 10),
    elite_fans: parseInt(process.env.ELITE_FANS ?? '5500000', 10),
    streak_target_threshold: parseInt(process.env.STREAK_TARGET_THRESHOLD ?? '5000000', 10),
  },

  defaults: {
    week_start_day: 1,
    timezone: 'Europe/Madrid',
  },

  ollama: {
    host: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL ?? 'llama3',
  },
};

module.exports = config;
