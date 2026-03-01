const { SlashCommandBuilder } = require('discord.js');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const { getBlacklist } = require('../database');
const { formatJSTTimestamp } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('(Officers) View all trainer names blacklisted from auto-import.'),

  async execute(interaction) {
    const officer = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(officer)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const entries = getBlacklist();

    if (entries.length === 0) {
      return interaction.reply({
        content: '📋 No blacklisted members.',
        ephemeral: true,
      });
    }

    const lines = entries.map((e, i) => {
      const date = e.created_at ? formatJSTTimestamp(e.created_at) : 'unknown';
      const addedBy = e.added_by ? `<@${e.added_by}>` : 'unknown';
      const reason = e.reason ? ` — reason: ${e.reason}` : '';
      return `**${i + 1}.** \`${e.trainer_name}\` — added by ${addedBy} on ${date} JST${reason}`;
    });

    return interaction.reply({
      content: [`📋 **Import Blacklist** (${entries.length}):`, '', ...lines].join('\n'),
      ephemeral: true,
    });
  },
};
