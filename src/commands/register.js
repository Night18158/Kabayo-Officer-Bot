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
    )
    .addBooleanOption(option =>
      option
        .setName('dm_warnings')
        .setDescription('Receive DM reminders and warnings (default: true)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const ign = interaction.options.getString('ign').trim();
    const userId = interaction.user.id;
    const dmOption = interaction.options.getBoolean('dm_warnings');

    const existing = getMember(userId);
    // For new registrations default dm_warnings to true; for updates only set if explicitly provided
    const dmValue = existing && dmOption === null ? null : (dmOption ?? true);
    upsertMember(userId, ign, dmValue);

    const verb = existing ? 'Updated IGN to' : 'Registered as';
    const member = getMember(userId);
    const dmStatus = member.dm_warnings_enabled === 1 ? '✅ enabled' : '❌ disabled';

    await interaction.reply({
      content: `✅ ${verb} **${ign}**\nDM warnings: ${dmStatus}`,
      ephemeral: true,
    });
  },
};
