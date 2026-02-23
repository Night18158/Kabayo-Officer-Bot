const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getMember, submitFans, getThresholds } = require('../database');
const { calculateStatus, getStatusEmoji, getStatusLabel } = require('../utils/statusLogic');
const { formatFans, formatNumber } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adjust')
    .setDescription('(Officers) Directly set a member\'s weekly fan count.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(opt =>
      opt.setName('user').setDescription('The member to adjust').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('fans').setDescription('New weekly fan count').setRequired(true).setMinValue(0)
    )
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the adjustment').setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const fans       = interaction.options.getInteger('fans');
    const reason     = interaction.options.getString('reason');

    const dbMember = getMember(targetUser.id);
    if (!dbMember) {
      await interaction.reply({
        content: `❌ <@${targetUser.id}> is not registered yet.`,
        ephemeral: true,
      });
      return;
    }

    const thresholds = getThresholds();
    const status     = calculateStatus(fans, thresholds);
    const emoji      = getStatusEmoji(status);
    const label      = getStatusLabel(status);

    submitFans(targetUser.id, fans, status);

    console.log(
      `[ADJUST] Officer ${interaction.user.tag} (${interaction.user.id}) adjusted ` +
      `${dbMember.in_game_name} (${targetUser.id}) ` +
      `to ${fans} fans (${status}). Reason: ${reason}`
    );

    await interaction.reply({
      content: [
        `✅ Adjusted **${dbMember.in_game_name}**`,
        ``,
        `**Fans:** ${formatNumber(fans)} (${formatFans(fans)})`,
        `**Status:** ${emoji} ${label}`,
        `**Reason:** ${reason}`,
      ].join('\n'),
      ephemeral: true,
    });
  },
};
