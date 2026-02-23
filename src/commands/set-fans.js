const { SlashCommandBuilder } = require('discord.js');
const { getMember, submitFans, getThresholds } = require('../database');
const { calculateStatus, getStatusEmoji, getStatusLabel } = require('../utils/statusLogic');
const { formatFans, formatNumber } = require('../utils/formatters');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-fans')
    .setDescription('(Officers) Set an exact fan count for a member (overrides current total).')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The member to update').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('fans').setDescription('Exact fan count to set').setRequired(true).setMinValue(0)
    ),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const fans       = interaction.options.getInteger('fans');

    const dbMember = getMember(targetUser.id);
    if (!dbMember) {
      return interaction.reply({
        content: `❌ <@${targetUser.id}> is not registered yet.`,
        ephemeral: true,
      });
    }

    const prevFans   = dbMember.weekly_fans_current;
    const thresholds = getThresholds();
    const status     = calculateStatus(fans, thresholds);
    const emoji      = getStatusEmoji(status);
    const label      = getStatusLabel(status);

    submitFans(targetUser.id, fans, status, 'manual');

    const nextInfo = fans < thresholds.elite_fans
      ? `Fans needed for ELITE: +${formatFans(thresholds.elite_fans - fans)}`
      : '✅ Already at ELITE tier!';

    await interaction.reply({
      content: [
        `✅ Fans set for **${dbMember.in_game_name}**!`,
        '',
        `Previous: ${formatNumber(prevFans)} (${formatFans(prevFans)})`,
        `New Total: ${formatNumber(fans)} (${formatFans(fans)})`,
        `Status: ${emoji} ${label}`,
        '',
        nextInfo,
      ].join('\n'),
      ephemeral: true,
    });
  },
};
