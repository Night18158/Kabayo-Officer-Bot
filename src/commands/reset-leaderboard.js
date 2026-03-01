const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const { fullLeaderboardReset, db } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');

// Project root is two levels up from src/commands/
const PROJECT_ROOT = path.join(__dirname, '..', '..');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-leaderboard')
    .setDescription('(Officers) Wipe all fan data for a clean re-import.')
    .addStringOption(opt =>
      opt
        .setName('confirm')
        .setDescription('Type CONFIRM to proceed')
        .setRequired(true)
    )
    .addBooleanOption(opt =>
      opt
        .setName('clear-history')
        .setDescription('Also delete all weekly history (season totals)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const officer = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(officer)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const confirm = interaction.options.getString('confirm');
    if (confirm !== 'CONFIRM') {
      return interaction.reply({
        content: '❌ Reset cancelled. You must type exactly `CONFIRM` in the confirm option to proceed.',
        ephemeral: true,
      });
    }

    const clearHistory = interaction.options.getBoolean('clear-history') ?? false;

    const { affected, backupPath } = fullLeaderboardReset();
    const backupRelative = path.relative(PROJECT_ROOT, backupPath);

    if (clearHistory) {
      db.prepare('DELETE FROM weekly_history').run();
    }

    const lines = [
      `✅ Leaderboard reset complete. ${affected} members wiped. Backup saved to \`${backupRelative}\`. Run \`/auto-import\` to re-import fresh data.`,
    ];
    if (clearHistory) {
      lines.push('⚠️ Weekly history was also cleared.');
    }

    return interaction.reply({ content: lines.join('\n'), ephemeral: true });
  },
};
