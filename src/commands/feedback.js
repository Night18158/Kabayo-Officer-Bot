const { SlashCommandBuilder } = require('discord.js');
const { getMember, getSetting } = require('../database');
const { trySend } = require('../utils/scheduledMessages');
const { formatJSTTimestamp } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('feedback')
    .setDescription('Send feedback to the officers.')
    .addStringOption(opt =>
      opt
        .setName('type')
        .setDescription('Type of feedback')
        .setRequired(true)
        .addChoices(
          { name: 'Bug Report', value: 'bug' },
          { name: 'Feature Request', value: 'feature' },
          { name: 'Opinion / Other', value: 'opinion' }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('message')
        .setDescription('Your feedback message')
        .setRequired(true)
        .setMaxLength(1000)
    ),

  async execute(interaction) {
    const type = interaction.options.getString('type');
    const message = interaction.options.getString('message');

    const dbMember = getMember(interaction.user.id);
    const displayName = dbMember ? dbMember.in_game_name : interaction.user.username;

    const typeLabels = { bug: '🐛 Bug Report', feature: '✨ Feature Request', opinion: '💬 Opinion / Other' };
    const typeLabel = typeLabels[type] || type;

    const now = formatJSTTimestamp(new Date());

    const officerMessage = [
      `📬 **New Feedback** from **${displayName}** (<@${interaction.user.id}>)`,
      '',
      `**Type:** ${typeLabel}`,
      `**Message:** ${message}`,
      '',
      `🕐 ${now} JST`,
    ].join('\n');

    const officerChannel = getSetting('channel_officer');
    await trySend(interaction.client, officerChannel, officerMessage);

    return interaction.reply({
      content: '✅ Your feedback has been sent to the officers. Thank you!',
      ephemeral: true,
    });
  },
};
