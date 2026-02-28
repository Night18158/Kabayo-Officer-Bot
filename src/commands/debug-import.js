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

      let data, prevData;
      try {
        data = await fetchCircleData(circleId, fetchYear, fetchMonth);
      } catch (_) {
        data = { members: [] };
      }
      try {
        prevData = await fetchCircleData(circleId, prevYear, prevMonth);
      } catch (_) {
        prevData = { members: [] };
      }

      const currentMembers = (data && data.members) || [];
      const prevMembers = (prevData && prevData.members) || [];

      // Determine which month is actually used as primary source
      const usingPrev = currentMembers.length === 0 && prevMembers.length > 0;
      const activeMembers = usingPrev ? prevMembers : currentMembers;
      const activeYear = usingPrev ? prevYear : fetchYear;
      const activeMonth = usingPrev ? prevMonth : fetchMonth;

      const allMembers = getAllMembers();

      // Calculate samples for first 3 uma.moe members (from active source)
      const sampleLines = [];
      const compareLines = [];

      for (const umaMember of activeMembers.slice(0, 3)) {
        const df = umaMember.daily_fans || [];
        const lastIdx = findLastDataIndex(df);
        let baseIdx = lastIdx >= 0 ? findWeekBaseIndex(activeYear, activeMonth, lastIdx) : -1;
        if (baseIdx < 0) baseIdx = 0;

        const lastVal = lastIdx >= 0 ? df[lastIdx] : 0;
        const baseVal = df[baseIdx] || 0;
        const weeklyFans = calculateWeeklyFans(df, activeYear, activeMonth);

        sampleLines.push(
          `• **${umaMember.trainer_name}**: lastIdx=${lastIdx}, baseIdx=${baseIdx}, ` +
          `daily[${lastIdx}]=${formatFans(lastVal)}, daily[${baseIdx}]=${formatFans(baseVal)}, weeklyFans=${formatFans(weeklyFans)}`
        );
      }

      // Compare DB vs API for all members (show first 5 matches, using active source)
      const secondaryMembers = usingPrev ? currentMembers : prevMembers;
      const secondaryYear = usingPrev ? fetchYear : prevYear;
      const secondaryMonth = usingPrev ? fetchMonth : prevMonth;
      const secondaryMap = new Map();
      for (const m of secondaryMembers) {
        secondaryMap.set(m.trainer_name.toLowerCase(), m);
      }

      let compareCount = 0;
      for (const umaMember of activeMembers) {
        if (compareCount >= 5) break;

        const dbMember =
          allMembers.find(m =>
            (m.uma_trainer_name && m.uma_trainer_name.toLowerCase() === umaMember.trainer_name.toLowerCase()) ||
            m.in_game_name.toLowerCase() === umaMember.trainer_name.toLowerCase()
          );

        if (!dbMember) continue;

        let weeklyFans;
        const secondaryMember = secondaryMap.get(umaMember.trainer_name.toLowerCase());
        if (!usingPrev && secondaryMember) {
          weeklyFans = calculateCrossMonthWeeklyFans(
            umaMember.daily_fans, activeYear, activeMonth,
            secondaryMember.daily_fans, secondaryMember.next_month_start,
            secondaryYear, secondaryMonth
          );
        } else {
          weeklyFans = calculateWeeklyFans(umaMember.daily_fans, activeYear, activeMonth);
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

      const currentMonthLabel = `${fetchYear}-${String(fetchMonth).padStart(2, '0')}`;
      const prevMonthLabel = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

      const lines = [
        '🔍 **Import Debug Info**',
        '',
        `📅 JST Date: ${jstDateStr} (${dayName})`,
        `📅 Current month (${currentMonthLabel}): ${currentMembers.length} members${currentMembers.length === 0 ? '' : usingPrev ? '' : ' ← using this'}`,
        `📅 Previous month (${prevMonthLabel}): ${prevMembers.length} members${usingPrev ? ' ← using this' : ''}`,
        `🔢 Circle ID: ${circleId}`,
        '',
        '**Sample (first 3 members):**',
        ...sampleLines,
        '',
        '**Current DB vs calculated:**',
        ...compareLines,
        '',
        `⏰ Last auto-import: ${lastImportStr}`,
        '⏰ Auto-import cron: 01:00, 07:00, 13:00, 19:00 JST',
      ];

      await interaction.editReply({ content: lines.join('\n') });
    } catch (err) {
      console.error('debug-import command failed:', err);
      await interaction.editReply({ content: `❌ Debug import failed: ${err.message}` });
    }
  },
};
