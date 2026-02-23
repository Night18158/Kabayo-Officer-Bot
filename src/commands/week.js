const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllMembers, emergencyReset } = require('../database');
const { closeWeek } = require('../utils/weekClose');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('week')
    .setDescription('(Officers) Week management commands.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('close')
        .setDescription('Close the current week: generate report, update streaks, assign roles, send warnings.')
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Reset all weekly fans to 0 without generating a report (emergency/testing).')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'close') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await closeWeek(interaction.client);
        await interaction.editReply({ content: '✅ Week closed. Report generated.' });
      } catch (err) {
        console.error('Error closing week:', err);
        await interaction.editReply({ content: `❌ Failed to close week: ${err.message}` });
      }
      return;
    }

    if (sub === 'reset') {
      const members = getAllMembers();
      emergencyReset();
      await interaction.reply({
        content: `✅ Week reset. All fans set to 0 (${members.length} member(s) affected).`,
        ephemeral: true,
      });
    }
  },
};
