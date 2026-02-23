const { SlashCommandBuilder } = require('discord.js');
const { getMember, getMemberStats, getMemberAllTimeBest } = require('../database');
const { getStatusEmoji, getStatusLabel } = require('../utils/statusLogic');
const { formatFans } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare your stats with another member.')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The member to compare against')
        .setRequired(true)
    ),

  async execute(interaction) {
    const selfMember = getMember(interaction.user.id);
    if (!selfMember) {
      return interaction.reply({
        content: '❌ You are not registered. Use `/link-profile` first.',
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({
        content: '❌ You cannot compare yourself with yourself.',
        ephemeral: true,
      });
    }

    const targetMember = getMember(targetUser.id);
    if (!targetMember) {
      return interaction.reply({
        content: `❌ <@${targetUser.id}> is not registered yet.`,
        ephemeral: true,
      });
    }

    const selfStats  = getMemberStats(interaction.user.id);
    const targetStats = getMemberStats(targetUser.id);
    const selfBest   = getMemberAllTimeBest(interaction.user.id);
    const targetBest = getMemberAllTimeBest(targetUser.id);

    const selfEmoji   = getStatusEmoji(selfMember.weekly_status);
    const targetEmoji = getStatusEmoji(targetMember.weekly_status);

    const NAME_COL  = 16;
    const VALUE_COL = 18;
    const col1 = selfMember.in_game_name.padEnd(NAME_COL);
    const col2 = targetMember.in_game_name;

    return interaction.reply({
      content: [
        `⚔️ **Comparison**`,
        ``,
        `\`\`\``,
        `                  ${col1}  ${col2}`,
        `Fans this week  : ${formatFans(selfMember.weekly_fans_current).padEnd(VALUE_COL)} ${formatFans(targetMember.weekly_fans_current)}`,
        `Status          : ${(selfEmoji + ' ' + getStatusLabel(selfMember.weekly_status)).padEnd(VALUE_COL)} ${targetEmoji + ' ' + getStatusLabel(targetMember.weekly_status)}`,
        `Streak (target) : ${String(selfMember.streak_target_weeks + ' wk(s)').padEnd(VALUE_COL)} ${targetMember.streak_target_weeks} wk(s)`,
        `Average (hist.) : ${formatFans(Math.round(selfStats.avg)).padEnd(VALUE_COL)} ${formatFans(Math.round(targetStats.avg))}`,
        `Best week ever  : ${formatFans(selfBest).padEnd(VALUE_COL)} ${formatFans(targetBest)}`,
        `\`\`\``,
      ].join('\n'),
      ephemeral: false,
    });
  },
};
