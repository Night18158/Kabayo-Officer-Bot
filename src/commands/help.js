const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available bot commands and how to use them.'),

  async execute(interaction) {
    await interaction.reply({
      content: [
        '## 📖 Kabayo Officer Bot — Help',
        '',
        '**`/register ign:<name>`**',
        '→ Link your Discord account to your in-game name. Run this once before submitting fans.',
        '',
        '**`/submit fans:<number> [user:@member]`**',
        '→ Submit your weekly fan count. Officers can submit on behalf of another member using the optional `user` parameter.',
        '',
        '**`/status [user:@member]`**',
        '→ Check the current weekly status of yourself or another member.',
        '→ Shows fan count, status (🟢/🟡/🔴), streaks, and what is needed to reach the next tier.',
        '',
        '**`/leaderboard [type:week|season] [sort:top|bottom] [count:n]`**',
        '→ Display the guild fan leaderboard. Defaults to top 10 for the current week.',
        '',
        '**Status Tiers:**',
        '🟢 **GREEN** — Strong Performance (≥ 4.8M fans)',
        '🟡 **YELLOW** — On Track (≥ 4.2M fans)',
        '🔴 **RED** — Needs Attention (< 4.2M fans)',
      ].join('\n'),
      ephemeral: true,
    });
  },
};
