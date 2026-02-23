const { SlashCommandBuilder } = require('discord.js');
const { setSetting, getThresholds } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const { formatFans } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-thresholds')
    .setDescription('(Officers) Change the fan thresholds for status calculation.')
    .addIntegerOption(opt =>
      opt
        .setName('min')
        .setDescription('Minimum fans (YELLOW threshold)')
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption(opt =>
      opt
        .setName('target')
        .setDescription('Target fans (GREEN threshold)')
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption(opt =>
      opt
        .setName('elite')
        .setDescription('Elite fans (ELITE threshold)')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const officer = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(officer)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const min    = interaction.options.getInteger('min');
    const target = interaction.options.getInteger('target');
    const elite  = interaction.options.getInteger('elite');

    if (!(min < target && target < elite)) {
      return interaction.reply({
        content: '❌ Thresholds must satisfy: **min < target < elite**',
        ephemeral: true,
      });
    }

    setSetting('min_fans', String(min));
    setSetting('target_fans', String(target));
    setSetting('elite_fans', String(elite));

    return interaction.reply({
      content: [
        '✅ **Thresholds Updated**',
        '',
        `🟡 Minimum (YELLOW): ${formatFans(min)}`,
        `🟢 Target (GREEN): ${formatFans(target)}`,
        `⚡ Elite: ${formatFans(elite)}`,
      ].join('\n'),
      ephemeral: true,
    });
  },
};
