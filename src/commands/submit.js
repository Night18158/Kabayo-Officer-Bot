const { SlashCommandBuilder } = require('discord.js');
const { getMember, submitFans, addWeeklyHistory, getThresholds, getCurrentWeekLabel, getSetting } = require('../database');
const { calculateStatus, getStatusEmoji, getStatusLabel } = require('../utils/statusLogic');
const { formatFans, formatNumber } = require('../utils/formatters');
const { trySend } = require('../utils/scheduledMessages');
const { isOfficer } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('(Officers) Add fans to a member\'s weekly total.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to submit fans for')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('fans')
        .setDescription('Fans to add to the member\'s current total')
        .setRequired(true)
        .setMinValue(0)
    ),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({
        content: '❌ Fans are tracked automatically from uma.moe.\nIf something looks wrong, ask a Guild Officer to correct it.',
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const fansToAdd  = interaction.options.getInteger('fans');

    const dbMember = getMember(targetUser.id);
    if (!dbMember) {
      return interaction.reply({
        content: `❌ <@${targetUser.id}> is not registered yet. Use \`/register\` first.`,
        ephemeral: true,
      });
    }

    const prevFans   = dbMember.weekly_fans_current;
    const newTotal   = prevFans + fansToAdd;
    const thresholds = getThresholds();
    const status     = calculateStatus(newTotal, thresholds);
    const weekLabel  = getCurrentWeekLabel();

    submitFans(targetUser.id, newTotal, status, 'manual');
    addWeeklyHistory(targetUser.id, weekLabel, newTotal, status);

    const emoji    = getStatusEmoji(status);
    const label    = getStatusLabel(status);
    const nextInfo = newTotal < thresholds.elite_fans
      ? `Fans needed for ELITE: +${formatFans(thresholds.elite_fans - newTotal)}`
      : '✅ Already at ELITE tier!';

    await interaction.reply({
      content: [
        `✅ Fans added for **${dbMember.in_game_name}**!`,
        '',
        `Previous: ${formatNumber(prevFans)} (${formatFans(prevFans)})`,
        `Added: +${formatNumber(fansToAdd)} (${formatFans(fansToAdd)})`,
        `New Total: ${formatNumber(newTotal)} (${formatFans(newTotal)})`,
        `Status: ${emoji} ${label}`,
        '',
        nextInfo,
      ].join('\n'),
      ephemeral: true,
    });

    // Live feed: post noteworthy submissions to channel_tracker
    if (newTotal >= thresholds.elite_fans) {
      const trackerChannel = getSetting('channel_tracker');
      await trySend(interaction.client, trackerChannel, `⚡ **${dbMember.in_game_name}** just hit **${formatFans(newTotal)}** — Elite performance!`);
    } else if (newTotal >= thresholds.target_fans) {
      const trackerChannel = getSetting('channel_tracker');
      await trySend(interaction.client, trackerChannel, `🟢 **${dbMember.in_game_name}** just hit GREEN with **${formatFans(newTotal)}**!`);
    }
  },
};
