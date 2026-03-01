const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db, getMember, getThresholds } = require('../database');
const { getStatusEmoji, getStatusLabel, fansNeededForNext } = require('../utils/statusLogic');
const { formatFans, formatNumber } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check the weekly status of a member.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Member to check (defaults to yourself)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Look up by in-game name or uma trainer name')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const targetName = interaction.options.getString('name');

    let dbMember;

    if (targetUser) {
      dbMember = getMember(targetUser.id);
    } else if (targetName) {
      dbMember = db.prepare(
        'SELECT * FROM members WHERE LOWER(in_game_name) = LOWER(?) OR LOWER(uma_trainer_name) = LOWER(?)'
      ).get(targetName, targetName);
    } else {
      dbMember = getMember(interaction.user.id);
    }

    if (!dbMember) {
      let notFoundMsg;
      if (targetUser) {
        notFoundMsg = `❌ <@${targetUser.id}> is not registered yet.`;
      } else if (targetName) {
        notFoundMsg = `❌ No member found for **${targetName}**.`;
      } else {
        notFoundMsg = '❌ You are not registered yet. Use `/link-profile` first.';
      }
      await interaction.reply({ content: notFoundMsg, ephemeral: true });
      return;
    }

    const thresholds = getThresholds();
    const fans = dbMember.weekly_fans_current;
    const status = dbMember.weekly_status;
    const emoji = getStatusEmoji(status);
    const label = getStatusLabel(status);
    const nextInfo = fansNeededForNext(fans, thresholds);

    const lastSub = dbMember.last_submission_timestamp
      ? new Date(dbMember.last_submission_timestamp).toLocaleString('en-GB', { timeZone: 'Europe/Madrid' })
      : 'Never';

    await interaction.reply({
      content: [
        `${emoji} **Status for ${dbMember.in_game_name}**`,
        ``,
        `**Weekly Fans:** ${formatNumber(fans)} (${formatFans(fans)})`,
        `**Status:** ${emoji} ${label}`,
        `**Streak (≥ target):** ${dbMember.streak_target_weeks} week(s)`,
        `**Streak (elite):** ${dbMember.streak_elite_weeks} week(s)`,
        `**Consecutive RED weeks:** ${dbMember.consecutive_red_weeks}`,
        `**Last submission:** ${lastSub}`,
        ``,
        nextInfo,
      ].join('\n'),
      ephemeral: false,
    });
  },
};
