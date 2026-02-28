const { SlashCommandBuilder } = require('discord.js');
const { setSetting, getSetting } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-bot-channels')
    .setDescription('(Officers) Restrict slash commands to a specific channel.')
    .addChannelOption(opt =>
      opt.setName('commands')
        .setDescription('Channel where bot commands are allowed (leave empty to allow everywhere)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const channel = interaction.options.getChannel('commands');

    if (!channel) {
      // Clear the restriction
      setSetting('channel_bot_commands', '');
      return interaction.reply({
        content: '✅ Bot command channel restriction removed. Commands work everywhere.',
        ephemeral: true,
      });
    }

    setSetting('channel_bot_commands', channel.id);
    return interaction.reply({
      content: `✅ Bot commands are now restricted to <#${channel.id}>.\nExempt commands: \`/set-bot-channels\`, \`/set-officer-roles\`, \`/set-channels\`, \`/set-roles\`.`,
      ephemeral: true,
    });
  },
};
