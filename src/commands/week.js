const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllMembers, emergencyReset } = require('../database');
const { closeWeek } = require('../utils/weekClose');
const { postNewWeekMessage } = require('../utils/scheduledMessages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('week')
    .setDescription('(Officers) Week management commands.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Announce the start of a new week in the tracker channel.')
    )
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

    if (sub === 'start') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await postNewWeekMessage(interaction.client);
        await interaction.editReply({ content: '✅ New week announced in #tracker.' });
      } catch (err) {
        console.error('Error posting week start:', err);
        await interaction.editReply({ content: `❌ Failed to post week start: ${err.message}` });
      }
      return;
    }

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
