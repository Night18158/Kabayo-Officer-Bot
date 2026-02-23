const { SlashCommandBuilder } = require('discord.js');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const { getSetting, getAllMembers } = require('../database');
const { DEFAULT_CIRCLE_ID } = require('../utils/umaImport');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('import-status')
    .setDescription('(Officers) Show the last auto-import results.'),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const circleId = getSetting('uma_circle_id') || DEFAULT_CIRCLE_ID;
    const lastImportTime = getSetting('last_import_time');
    const lastImportResultRaw = getSetting('last_import_result');

    let lastImportStr = 'Never';
    if (lastImportTime) {
      const d = new Date(lastImportTime);
      const jstStr = d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour12: false });
      lastImportStr = `${jstStr} JST`;
    }

    let importedCount = 0;
    let skippedCount = 0;
    let unmatchedCount = 0;

    if (lastImportResultRaw) {
      try {
        const parsed = JSON.parse(lastImportResultRaw);
        importedCount = parsed.imported ?? 0;
        skippedCount = parsed.skipped ?? 0;
        unmatchedCount = parsed.unmatched?.length ?? 0;
      } catch (_) {
        // ignore parse errors
      }
    }

    const allMembers = getAllMembers();
    const noData = allMembers.filter(m => m.weekly_fans_current === 0).length;
    const totalMembers = allMembers.length;

    const content = [
      '📥 **Import Status**',
      '',
      `Circle ID: ${circleId}`,
      `Last import: ${lastImportStr}`,
      `Members matched: ${importedCount + skippedCount}/${totalMembers}`,
      'Fan source breakdown:',
      `  🤖 Auto (uma.moe): ${importedCount}`,
      `  ✋ Manual (officer): ${skippedCount}`,
      `  📭 No data: ${noData}`,
    ].join('\n');

    return interaction.reply({ content, ephemeral: true });
  },
};
