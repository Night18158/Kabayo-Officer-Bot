const { SlashCommandBuilder } = require('discord.js');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const { getSetting, getAllMembers } = require('../database');
const {
  fetchCircleData,
  findLastDataIndex,
  findWeekBaseIndex,
  calculateWeeklyFans,
  calculateCrossMonthWeeklyFans,
  DEFAULT_CIRCLE_ID,
} = require('../utils/umaImport');
const { formatFans } = require('../utils/formatters');

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('debug-import')
    .setDescription('(Officers) Debug auto-import without updating the database.'),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const circleId = getSetting('uma_circle_id') || DEFAULT_CIRCLE_ID;

      // Calculate JST date
      const jstOffset = 9 * 60 * 60 * 1000;
      const jstNow = new Date(Date.now() + jstOffset);
      const fetchYear = jstNow.getUTCFullYear();
      const fetchMonth = jstNow.getUTCMonth() + 1;
      const jstDay = jstNow.getUTCDate();

      const dayName = DAY_NAMES[jstNow.getUTCDay()];
      const jstDateStr = `${fetchYear}-${String(fetchMonth).padStart(2, '0')}-${String(jstDay).padStart(2, '0')}`;

      const prevMonth = fetchMonth === 1 ? 12 : fetchMonth - 1;
      const prevYear = fetchMonth === 1 ? fetchYear - 1 : fetchYear;
      const isFirstWeek = jstDay <= 7;

      const data = await fetchCircleData(circleId, fetchYear, fetchMonth);

      let prevData = null;
      if (isFirstWeek) {
        try {
          prevData = await fetchCircleData(circleId, prevYear, prevMonth);
        } catch (_) {
          // Previous month unavailable
        }
      }

      const allMembers = getAllMembers();
      const memberMap = new Map(allMembers.map(m => [m.in_game_name.toLowerCase(), m]));

      // Calculate samples for first 3 uma.moe members
      const sampleLines = [];
      const compareLines = [];

      for (const umaMember of data.members.slice(0, 3)) {
        const df = umaMember.daily_fans || [];
        const lastIdx = findLastDataIndex(df);
        let baseIdx = lastIdx >= 0 ? findWeekBaseIndex(fetchYear, fetchMonth, lastIdx) : -1;
        if (baseIdx < 0) baseIdx = 0;

        const lastVal = lastIdx >= 0 ? df[lastIdx] : 0;
        const baseVal = df[baseIdx] || 0;
        const weeklyFans = calculateWeeklyFans(df, fetchYear, fetchMonth);

        sampleLines.push(
          `• **${umaMember.trainer_name}**: lastIdx=${lastIdx}, baseIdx=${baseIdx}, ` +
          `daily[${lastIdx}]=${formatFans(lastVal)}, daily[${baseIdx}]=${formatFans(baseVal)}, weeklyFans=${formatFans(weeklyFans)}`
        );
      }

      // Compare DB vs API for all members (show first 5 matches)
      let compareCount = 0;
      for (const umaMember of data.members) {
        if (compareCount >= 5) break;

        const dbMember =
          allMembers.find(m =>
            (m.uma_trainer_name && m.uma_trainer_name.toLowerCase() === umaMember.trainer_name.toLowerCase()) ||
            m.in_game_name.toLowerCase() === umaMember.trainer_name.toLowerCase()
          );

        if (!dbMember) continue;

        let weeklyFans;
        if (prevData) {
          const prevMember = prevData.members.find(m =>
            m.trainer_name.toLowerCase() === umaMember.trainer_name.toLowerCase()
          );
          if (prevMember) {
            weeklyFans = calculateCrossMonthWeeklyFans(
              umaMember.daily_fans, fetchYear, fetchMonth,
              prevMember.daily_fans, prevMember.next_month_start,
              prevYear, prevMonth
            );
          } else {
            weeklyFans = calculateWeeklyFans(umaMember.daily_fans, fetchYear, fetchMonth);
          }
        } else {
          weeklyFans = calculateWeeklyFans(umaMember.daily_fans, fetchYear, fetchMonth);
        }

        const dbFans = dbMember.weekly_fans_current;
        const action = weeklyFans > dbFans ? 'would import ✅' : 'skip - equal or lower';
        compareLines.push(
          `• **${umaMember.trainer_name}**: DB=${formatFans(dbFans)}, API=${formatFans(weeklyFans)} (${action})`
        );
        compareCount++;
      }

      // Last import info
      const lastImportTime = getSetting('last_import_time');
      const lastImportStr = lastImportTime
        ? new Date(lastImportTime).toISOString()
        : 'Never';

      const lines = [
        '🔍 **Import Debug Info**',
        '',
        `📅 JST Date: ${jstDateStr} (${dayName})`,
        `📅 Fetch: year=${fetchYear}, month=${fetchMonth}${isFirstWeek ? ` (also fetching prev month: ${prevYear}-${String(prevMonth).padStart(2, '0')})` : ''}`,
        `🔢 Circle ID: ${circleId}`,
        `👥 Members from uma.moe: ${data.members.length}`,
        '',
        '**Sample (first 3 members):**',
        ...sampleLines,
        '',
        '**Current DB vs calculated:**',
        ...compareLines,
        '',
        `⏰ Last auto-import: ${lastImportStr}`,
        '⏰ Auto-import cron: every 6 hours (Asia/Tokyo)',
      ];

      await interaction.editReply({ content: lines.join('\n') });
    } catch (err) {
      console.error('debug-import command failed:', err);
      await interaction.editReply({ content: `❌ Debug import failed: ${err.message}` });
    }
  },
};
