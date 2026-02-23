const { SlashCommandBuilder } = require('discord.js');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const { runAutoImport } = require('../utils/umaImport');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auto-import')
    .setDescription('(Officers) Import fan data from uma.moe for all registered members.'),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await runAutoImport();

      const unmatchedList = result.unmatched.length > 0
        ? '\n\nUnmatched trainer names:\n' + result.unmatched.map(n => `• ${n}`).join('\n')
        : '';

      const content = [
        '✅ **Auto-Import Complete**',
        '',
        `📥 Imported: ${result.imported} members`,
        `⏭️ Skipped: ${result.skipped} members (manually submitted)`,
        `❓ Unmatched: ${result.unmatched.length} members`,
        unmatchedList,
        result.unmatched.length > 0 ? '\nUse `/link-profile` to link unmatched names.' : '',
      ].join('\n').trim();

      await interaction.editReply({ content });
    } catch (err) {
      console.error('auto-import command failed:', err);
      await interaction.editReply({ content: `❌ Auto-import failed: ${err.message}` });
    }
  },
};
