const { SlashCommandBuilder } = require('discord.js');
const { getMember, db } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link-profile')
    .setDescription('Link your uma.moe trainer name for automatic fan tracking.')
    .addStringOption(opt =>
      opt
        .setName('uma-name')
        .setDescription('Your trainer name on uma.moe')
        .setRequired(true)
    ),

  async execute(interaction) {
    const member = getMember(interaction.user.id);
    if (!member) {
      return interaction.reply({
        content: '❌ You need to `/register` first.',
        ephemeral: true,
      });
    }

    const umaName = interaction.options.getString('uma-name');
    db.prepare('UPDATE members SET uma_trainer_name = ? WHERE discord_user_id = ?')
      .run(umaName, interaction.user.id);

    return interaction.reply({
      content: `✅ Linked your profile to uma.moe trainer name: **${umaName}**`,
      ephemeral: true,
    });
  },
};
