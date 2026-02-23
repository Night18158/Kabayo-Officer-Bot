const { SlashCommandBuilder } = require('discord.js');
const { getMember, db, upsertMember } = require('../database');
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
    let dbMember = getMember(targetUserId);

    // If user not registered, check for uma_ placeholder and merge
    if (!dbMember) {
      const placeholder = `uma_${umaName}`;
      const umaRecord = getMember(placeholder);

      if (umaRecord) {
        // Register the real user first
        upsertMember(targetUserId, umaName);
        dbMember = getMember(targetUserId);

        // Transfer fans and stats from placeholder to real user
        db.prepare(`
          UPDATE members SET
            weekly_fans_current = ?,
            weekly_fans_previous = ?,
            weekly_status = ?,
            streak_target_weeks = ?,
            streak_elite_weeks = ?,
            consecutive_red_weeks = ?,
            fan_source = ?,
            uma_trainer_name = ?,
            last_submission_timestamp = ?
          WHERE discord_user_id = ?
        `).run(
          umaRecord.weekly_fans_current,
          umaRecord.weekly_fans_previous,
          umaRecord.weekly_status,
          umaRecord.streak_target_weeks,
          umaRecord.streak_elite_weeks,
          umaRecord.consecutive_red_weeks,
          umaRecord.fan_source,
          umaName,
          umaRecord.last_submission_timestamp,
          targetUserId
        );

        // Move weekly_history from placeholder to real user
        db.prepare('UPDATE weekly_history SET discord_user_id = ? WHERE discord_user_id = ?')
          .run(targetUserId, placeholder);

        // Move member_notes from placeholder to real user
        db.prepare('UPDATE member_notes SET discord_user_id = ? WHERE discord_user_id = ?')
          .run(targetUserId, placeholder);

        // Delete the placeholder
        db.prepare('DELETE FROM members WHERE discord_user_id = ?').run(placeholder);

        return interaction.reply({
          content: `✅ Linked and merged **${umaName}**'s uma.moe data with your Discord profile! All existing fan data has been transferred.`,
          ephemeral: true,
        });
      }

      // No placeholder found either — user needs to register
      const mention = targetUserOption ? `<@${targetUserId}>` : 'You';
      return interaction.reply({
        content: `❌ ${mention} need${targetUserOption ? 's' : ''} to use \`/link-profile\` first, or the uma.moe name **${umaName}** was not found. Run \`/auto-import\` first.`,
        ephemeral: true,
      });
    }

    // User exists — just update their uma_trainer_name
    db.prepare('UPDATE members SET uma_trainer_name = ? WHERE discord_user_id = ?')
      .run(umaName, targetUserId);

    const targetName = dbMember.in_game_name;
    return interaction.reply({
      content: `✅ Linked **${targetName}**'s profile to uma.moe trainer name: **${umaName}**`,
      ephemeral: true,
    });
  },
};
