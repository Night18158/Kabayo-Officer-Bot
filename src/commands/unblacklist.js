const { SlashCommandBuilder } = require('discord.js');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const { removeFromBlacklist } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unblacklist')
    .setDescription('(Officers) Remove a trainer name from the import blacklist.')
    .addStringOption(opt =>
      opt.setName('name').setDescription('The trainer name to unblacklist').setRequired(true)
    ),

  async execute(interaction) {
    const officer = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(officer)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const trainerName = interaction.options.getString('name');
    const removed = removeFromBlacklist(trainerName);

    if (!removed) {
      return interaction.reply({
        content: `❌ \`${trainerName}\` was not found in the blacklist.`,
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: `✅ \`${trainerName}\` has been removed from the blacklist. The next auto-import will pick them up again if they appear on uma.moe.`,
      ephemeral: true,
    });
  },
};
