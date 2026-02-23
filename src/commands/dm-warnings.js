const { SlashCommandBuilder } = require('discord.js');
const { getMember, setDmWarnings } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm-warnings')
    .setDescription('Toggle whether you receive DM reminders and warnings.')
    .addBooleanOption(option =>
      option
        .setName('enabled')
        .setDescription('Enable or disable DM warnings')
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const member = getMember(userId);

    if (!member) {
      await interaction.reply({
        content: '❌ You need to `/register` first.',
        ephemeral: true,
      });
      return;
    }

    const enabled = interaction.options.getBoolean('enabled');
    setDmWarnings(userId, enabled);

    const msg = enabled
      ? '✅ DM warnings enabled.'
      : '✅ DM warnings disabled. You won\'t receive weekly reminders via DM.';

    await interaction.reply({ content: msg, ephemeral: true });
  },
};
