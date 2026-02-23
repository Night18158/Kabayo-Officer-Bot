const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available bot commands and how to use them.'),

  async execute(interaction) {
    await interaction.reply({
      content: [
        '📖 **Kabayo Officer Bot — Commands**',
        '',
        '👤 **Member Commands:**',
        '`/register ign:<name>` — Register your IGN',
        '`/status [@user]` — View status',
        '`/leaderboard` — Weekly leaderboard',
        '`/dm-warnings enabled:<bool>` — Toggle DM reminders',
        '`/week status` — View current week overview & countdown',
        '`/link-profile uma-name:<name>` — Link your uma.moe trainer name',
        '`/help` — This message',
        '',
        '🛡️ **Officer Commands** (Guild Officer + Leader):',
        '`/submit fans:<n> user:@member` — Add fans to a member\'s total',
        '`/set-fans user:@member fans:<n>` — Set exact fan count',
        '`/adjust user:@member fans:<number> reason:<text>` — Adjust fans',
        '`/week start` — Announce new week',
        '`/week close` — Close the week',
        '`/week reset` — Reset all weekly data',
        '`/set-channels` — Configure bot channels',
        '`/set-roles` — Configure reward roles',
        '`/auto-import` — Import fans from uma.moe',
        '`/import-status` — Check last import results',
        '`/set-circle id:<id>` — Set uma.moe circle ID',
        '',
        '👑 **Leader Commands** (Guild Leader only):',
        '`/set-officer-roles` — Define officer/leader/member roles',
        '',
        '⏰ **Automatic Schedule (JST):**',
        'Daily 07:00 — Auto-import from uma.moe',
        'Mon 04:05 — New week announcement',
        'Thu 12:00 — Midweek checkpoint',
        'Sun 10:00 — Push Day morning',
        'Sun 18:00 — Push Day evening',
        'Mon 02:00 — Final push DMs',
        'Mon 03:55 — Week close + report',
      ].join('\n'),
      ephemeral: true,
    });
  },
};
