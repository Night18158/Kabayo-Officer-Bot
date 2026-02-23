const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getMember, submitFans, addWeeklyHistory, getThresholds, getCurrentWeekLabel } = require('../database');
const { calculateStatus, getStatusEmoji, getStatusLabel, fansNeededForNext } = require('../utils/statusLogic');
const { formatFans, formatNumber } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('Submit your weekly fan count.')
    .addIntegerOption(option =>
      option
        .setName('fans')
        .setDescription('Your total fans this week')
        .setRequired(true)
        .setMinValue(0)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('(Officers only) Submit on behalf of another member')
        .setRequired(false)
    ),

  async execute(interaction) {
    const fans = interaction.options.getInteger('fans');
    const targetUser = interaction.options.getUser('user');

    // Determine whose submission this is
    let subjectId = interaction.user.id;
    let subjectName = interaction.user.username;

    if (targetUser) {
      // Only allow officers (manage guild permission) to submit for others
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: '❌ Only officers can submit on behalf of other members.',
          ephemeral: true,
        });
        return;
      }
      subjectId = targetUser.id;
      subjectName = targetUser.username;
    }

    const dbMember = getMember(subjectId);
    if (!dbMember) {
      const mention = targetUser ? `<@${subjectId}>` : 'You are';
      await interaction.reply({
        content: `❌ ${mention} not registered yet. Use \`/register\` first.`,
        ephemeral: true,
      });
      return;
    }

    const thresholds = getThresholds();
    const status = calculateStatus(fans, thresholds);
    const weekLabel = getCurrentWeekLabel();

    submitFans(subjectId, fans, status);
    addWeeklyHistory(subjectId, weekLabel, fans, status);

    const emoji = getStatusEmoji(status);
    const label = getStatusLabel(status);
    const nextInfo = fansNeededForNext(fans, thresholds);
    const submittedFor = targetUser ? ` for **${dbMember.in_game_name}**` : '';

    await interaction.reply({
      content: [
        `${emoji} Fans submitted${submittedFor}!`,
        ``,
        `**IGN:** ${dbMember.in_game_name}`,
        `**Week:** ${weekLabel}`,
        `**Fans:** ${formatNumber(fans)} (${formatFans(fans)})`,
        `**Status:** ${emoji} ${label}`,
        ``,
        nextInfo,
      ].join('\n'),
      ephemeral: true,
    });
  },
};
