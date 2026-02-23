const { SlashCommandBuilder } = require('discord.js');
const { getMember, setVacation, removeVacation, isOnVacation } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vacation')
    .setDescription('(Officers) Manage member vacation status.')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Mark a member as on vacation.')
        .addUserOption(opt =>
          opt.setName('user').setDescription('The member').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('weeks')
            .setDescription('Number of weeks for vacation')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(52)
        )
        .addStringOption(opt =>
          opt
            .setName('reason')
            .setDescription('Reason for vacation')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('End a member\'s vacation early.')
        .addUserOption(opt =>
          opt.setName('user').setDescription('The member').setRequired(true)
        )
    ),

  async execute(interaction) {
    const officer = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(officer)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user');
    const dbMember = getMember(targetUser.id);

    if (!dbMember) {
      return interaction.reply({
        content: `❌ <@${targetUser.id}> is not registered yet.`,
        ephemeral: true,
      });
    }

    if (sub === 'set') {
      const weeks = interaction.options.getInteger('weeks');
      const reason = interaction.options.getString('reason') || 'No reason given';

      const vacationUntil = new Date();
      vacationUntil.setDate(vacationUntil.getDate() + weeks * 7);

      setVacation(targetUser.id, vacationUntil.toISOString(), reason);

      return interaction.reply({
        content: [
          `✅ **${dbMember.in_game_name}** is now on vacation 🏖️`,
          `**Duration:** ${weeks} week(s)`,
          `**Until:** ${vacationUntil.toDateString()}`,
          `**Reason:** ${reason}`,
          '',
          'They will be excluded from RED warnings during this period.',
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (sub === 'remove') {
      if (!isOnVacation(dbMember)) {
        return interaction.reply({
          content: `❌ **${dbMember.in_game_name}** is not currently on vacation.`,
          ephemeral: true,
        });
      }

      removeVacation(targetUser.id);

      return interaction.reply({
        content: `✅ Vacation ended for **${dbMember.in_game_name}**. They are now active again.`,
        ephemeral: true,
      });
    }
  },
};
