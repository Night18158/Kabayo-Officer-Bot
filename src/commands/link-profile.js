const { SlashCommandBuilder } = require('discord.js');
const { getMember, db } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link-profile')
    .setDescription('Link a uma.moe trainer name for automatic fan tracking.')
    .addStringOption(opt =>
      opt
        .setName('uma-name')
        .setDescription('The trainer name on uma.moe')
        .setRequired(true)
    )
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('(Officers only) The member to link (defaults to yourself)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUserOption = interaction.options.getUser('user');
    const umaName = interaction.options.getString('uma-name');

    // If linking another user, require officer permission
    if (targetUserOption && targetUserOption.id !== interaction.user.id) {
      const requestingMember = await interaction.guild.members.fetch(interaction.user.id);
      if (!isOfficer(requestingMember)) {
        return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
      }
    }

    const targetUserId = targetUserOption ? targetUserOption.id : interaction.user.id;
    const dbMember = getMember(targetUserId);

    if (!dbMember) {
      const mention = targetUserOption ? `<@${targetUserId}>` : 'You';
      return interaction.reply({
        content: `❌ ${mention} need${targetUserOption ? 's' : ''} to \`/register\` first.`,
        ephemeral: true,
      });
    }

    db.prepare('UPDATE members SET uma_trainer_name = ? WHERE discord_user_id = ?')
      .run(umaName, targetUserId);

    const targetName = dbMember.in_game_name;
    return interaction.reply({
      content: `✅ Linked **${targetName}**'s profile to uma.moe trainer name: **${umaName}**`,
      ephemeral: true,
    });
  },
};
