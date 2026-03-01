const { SlashCommandBuilder } = require('discord.js');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const { db, getMember, addToBlacklist } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-member')
    .setDescription('(Officers) Remove a member from the bot and blacklist them from auto-import.')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The Discord member to remove').setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('name').setDescription('In-game name or uma trainer name to remove').setRequired(false)
    ),

  async execute(interaction) {
    const officer = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(officer)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const targetName = interaction.options.getString('name');

    if (!targetUser && !targetName) {
      return interaction.reply({
        content: '❌ Please provide either a `user` mention or a `name`.',
        ephemeral: true,
      });
    }

    let dbMember = null;

    if (targetUser) {
      dbMember = getMember(targetUser.id);
      // Also check uma_ placeholder
      if (!dbMember) {
        dbMember = db.prepare('SELECT * FROM members WHERE discord_user_id = ?')
          .get(`uma_${targetUser.id}`);
      }
    } else {
      // Search by in_game_name or uma_trainer_name (case-insensitive)
      dbMember = db.prepare(
        'SELECT * FROM members WHERE LOWER(in_game_name) = LOWER(?) OR LOWER(uma_trainer_name) = LOWER(?)'
      ).get(targetName, targetName);
    }

    if (!dbMember) {
      const identifier = targetUser ? `<@${targetUser.id}>` : `**${targetName}**`;
      return interaction.reply({
        content: `❌ No member found for ${identifier}.`,
        ephemeral: true,
      });
    }

    // Determine the trainer name to blacklist (prefer uma_trainer_name, fall back to in_game_name)
    const blacklistName = dbMember.uma_trainer_name || dbMember.in_game_name;
    const displayName = dbMember.in_game_name;
    const discordUserId = dbMember.discord_user_id;

    // Delete member and related data
    db.prepare('DELETE FROM weekly_history WHERE discord_user_id = ?').run(discordUserId);
    db.prepare('DELETE FROM member_notes WHERE discord_user_id = ?').run(discordUserId);
    db.prepare('DELETE FROM members WHERE discord_user_id = ?').run(discordUserId);

    // Add to blacklist so auto-import won't re-register them
    addToBlacklist(blacklistName, interaction.user.id, 'Removed by officer');

    return interaction.reply({
      content: [
        `✅ **${displayName}** has been removed from the bot.`,
        `🚫 \`${blacklistName}\` has been added to the import blacklist — auto-import will no longer re-register them.`,
      ].join('\n'),
      ephemeral: true,
    });
  },
};
