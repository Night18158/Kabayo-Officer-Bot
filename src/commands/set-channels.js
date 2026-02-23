const { SlashCommandBuilder } = require('discord.js');
const { setSetting } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-channels')
    .setDescription('(Officers) Configure the channels used by the bot.')
    .addChannelOption(opt =>
      opt.setName('tracker').setDescription('Fan submission tracker channel').setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('results').setDescription('Weekly results report channel').setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('push').setDescription('Push / warning notifications channel').setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('officer').setDescription('Officer-only summary channel').setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('hof').setDescription('Hall of Fame channel').setRequired(false)
    ),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const mapping = {
      tracker: 'channel_tracker',
      results: 'channel_results',
      push:    'channel_push',
      officer: 'channel_officer',
      hof:     'channel_hof',
    };

    const updated = [];

    for (const [optName, settingKey] of Object.entries(mapping)) {
      const channel = interaction.options.getChannel(optName);
      if (channel) {
        setSetting(settingKey, channel.id);
        updated.push(`${optName} → <#${channel.id}>`);
      }
    }

    if (updated.length === 0) {
      await interaction.reply({ content: '⚠️ No channels provided. Use at least one option.', ephemeral: true });
      return;
    }

    await interaction.reply({
      content: `✅ Channels updated: ${updated.join(', ')}`,
      ephemeral: true,
    });
  },
};
