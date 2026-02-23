const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getAllMembers } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');

function generateCsv(members) {
  const headers = [
    'IGN',
    'Discord User ID',
    'Weekly Fans',
    'Status',
    'Target Streak',
    'Elite Streak',
    'Consecutive Red Weeks',
    'Warnings',
    'Fan Source',
    'UMA Trainer Name',
    'On Vacation Until',
  ];

  const escape = v => {
    const str = v == null ? '' : String(v);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const rows = members.map(m => [
    m.in_game_name,
    m.discord_user_id,
    m.weekly_fans_current,
    m.weekly_status,
    m.streak_target_weeks,
    m.streak_elite_weeks,
    m.consecutive_red_weeks,
    m.warnings_count,
    m.fan_source || 'none',
    m.uma_trainer_name || '',
    m.vacation_until || '',
  ].map(escape).join(','));

  return [headers.join(','), ...rows].join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('(Officers) Export all member data as a CSV file.'),

  async execute(interaction) {
    const officer = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(officer)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const members = getAllMembers();
      const csv = generateCsv(members);
      const buffer = Buffer.from(csv, 'utf-8');
      const now = new Date().toISOString().slice(0, 10);
      const attachment = new AttachmentBuilder(buffer, { name: `kabayo-export-${now}.csv` });

      await interaction.editReply({
        content: `✅ Export ready — ${members.length} member(s)`,
        files: [attachment],
      });
    } catch (err) {
      console.error('export command failed:', err);
      await interaction.editReply({ content: `❌ Export failed: ${err.message}` });
    }
  },
};
