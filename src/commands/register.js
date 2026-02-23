const { SlashCommandBuilder } = require('discord.js');
const { upsertMember, getMember } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Link your Discord account to your in-game name.')
    .addStringOption(option =>
      option
        .setName('ign')
        .setDescription('Your in-game name (IGN)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const ign = interaction.options.getString('ign').trim();
    const userId = interaction.user.id;

    const existing = getMember(userId);
    upsertMember(userId, ign);

    const verb = existing ? 'Updated IGN to' : 'Registered as';
    await interaction.reply({
      content: `✅ ${verb} **${ign}**`,
      ephemeral: true,
    });
  },
};
