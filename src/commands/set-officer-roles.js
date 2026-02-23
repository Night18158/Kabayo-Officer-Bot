const { SlashCommandBuilder } = require('discord.js');
const { setSetting } = require('../database');
const { isLeader, leaderOnlyMessage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-officer-roles')
    .setDescription('(Leader) Configure the guild leader/officer/member roles used for permission checks.')
    .addRoleOption(opt =>
      opt.setName('leader').setDescription('Guild Leader role').setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName('officer').setDescription('Guild Officer role').setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName('member').setDescription('Guild Member role').setRequired(true)
    ),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isLeader(member)) {
      return interaction.reply({ content: leaderOnlyMessage(), ephemeral: true });
    }

    const leaderRole  = interaction.options.getRole('leader');
    const officerRole = interaction.options.getRole('officer');
    const memberRole  = interaction.options.getRole('member');

    setSetting('role_guild_leader',  leaderRole.id);
    setSetting('role_guild_officer', officerRole.id);
    setSetting('role_guild_member',  memberRole.id);

    await interaction.reply({
      content: [
        '✅ Officer roles configured!',
        '',
        `👑 Guild Leader: <@&${leaderRole.id}>`,
        `🛡️ Guild Officer: <@&${officerRole.id}>`,
        `👤 Guild Member: <@&${memberRole.id}>`,
      ].join('\n'),
      ephemeral: true,
    });
  },
};
