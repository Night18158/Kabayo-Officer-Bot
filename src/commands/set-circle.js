const { SlashCommandBuilder } = require('discord.js');
const { setSetting } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-circle')
    .setDescription('(Officers) Set the uma.moe circle ID for auto-import.')
    .addStringOption(opt =>
      opt
        .setName('id')
        .setDescription('The uma.moe circle ID')
        .setRequired(true)
    ),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const circleId = interaction.options.getString('id');
    setSetting('uma_circle_id', circleId);

    return interaction.reply({
      content: `✅ uma.moe Circle ID set to: **${circleId}**`,
      ephemeral: true,
    });
  },
};
