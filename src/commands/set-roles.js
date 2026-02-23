const { SlashCommandBuilder } = require('discord.js');
const { setSetting } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-roles')
    .setDescription('(Officers) Configure the roles assigned by the bot.')
    .addRoleOption(opt =>
      opt.setName('mvp').setDescription('Role awarded to the weekly MVP').setRequired(false)
    )
    .addRoleOption(opt =>
      opt.setName('elite').setDescription('Role for elite members (≥ 5.5M fans)').setRequired(false)
    )
    .addRoleOption(opt =>
      opt.setName('core').setDescription('Role for core/GREEN members').setRequired(false)
    )
    .addRoleOption(opt =>
      opt.setName('risk').setDescription('Role for at-risk members (2+ consecutive RED weeks)').setRequired(false)
    ),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const mapping = {
      mvp:   'role_mvp',
      elite: 'role_elite',
      core:  'role_core',
      risk:  'role_risk',
    };

    const updated = [];

    for (const [optName, settingKey] of Object.entries(mapping)) {
      const role = interaction.options.getRole(optName);
      if (role) {
        setSetting(settingKey, role.id);
        updated.push(`${optName} → <@&${role.id}>`);
      }
    }

    if (updated.length === 0) {
      await interaction.reply({ content: '⚠️ No roles provided. Use at least one option.', ephemeral: true });
      return;
    }

    await interaction.reply({
      content: `✅ Roles updated: ${updated.join(', ')}`,
      ephemeral: true,
    });
  },
};
