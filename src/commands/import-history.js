const { SlashCommandBuilder } = require('discord.js');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const {
  getAllMembers,
  getThresholds,
  getSetting,
  addWeeklyHistory,
  weekHistoryExists,
  recalculateStreaksFromHistory,
  autoRegisterMember,
  isBlacklisted,
} = require('../database');
const { calculateStatus } = require('../utils/statusLogic');
const { fetchCircleData, DEFAULT_CIRCLE_ID } = require('../utils/umaImport');

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// ISO-week helpers (UTC-based, matching the standard in database.js)
// ---------------------------------------------------------------------------

/**
 * Return the ISO 8601 week label for a given UTC date.
 * @param {Date} date
 * @returns {string}  e.g. "2026-W05"
 */
function getWeekLabel(date) {
  const dayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + (4 - dayOfWeek));
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const weekNumber = Math.round((thursday - week1Monday) / (7 * MS_PER_DAY)) + 1;
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Return the Monday (UTC midnight) of the week containing the given date.
 * @param {Date} date
 * @returns {Date}
 */
function getMondayOfWeek(date) {
  const day = date.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

// ---------------------------------------------------------------------------
// Fan-value lookup from fetched API data
// ---------------------------------------------------------------------------

/**
 * Look up a single member's `daily_fans` entry for a specific date.
 * Returns null if the month's data is unavailable or the member isn't present.
 *
 * @param {Map<string, Object>} monthDataMap  key = "YYYY-M" → API response object
 * @param {string} trainerName
 * @param {Date}   date  (UTC)
 * @returns {number|null}
 */
function getDailyFansValue(monthDataMap, trainerName, date) {
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
  const apiData = monthDataMap.get(key);
  if (!apiData) return null;

  const umaMember = apiData.members.find(
    m => m.trainer_name.toLowerCase() === trainerName.toLowerCase()
  );
  if (!umaMember) return null;

  const idx = date.getUTCDate() - 1; // 0-indexed
  if (idx < 0 || idx >= umaMember.daily_fans.length) return null;
  return umaMember.daily_fans[idx];
}

/**
 * For a cross-month week (Monday in prev month, Sunday in curr month) look up
 * the `next_month_start` value from the previous month's member record.
 *
 * @param {Map<string, Object>} monthDataMap
 * @param {string} trainerName
 * @param {Date}   mondayDate  (UTC) — identifies the previous month
 * @returns {number|null}
 */
function getNextMonthStart(monthDataMap, trainerName, mondayDate) {
  const key = `${mondayDate.getUTCFullYear()}-${mondayDate.getUTCMonth() + 1}`;
  const apiData = monthDataMap.get(key);
  if (!apiData) return null;

  const umaMember = apiData.members.find(
    m => m.trainer_name.toLowerCase() === trainerName.toLowerCase()
  );
  if (!umaMember) return null;
  return umaMember.next_month_start ?? null;
}

// ---------------------------------------------------------------------------
// Core import logic
// ---------------------------------------------------------------------------

/**
 * Calculate weekly fans for one member for one complete ISO week.
 * Returns null when the data is unavailable, contains negative values
 * (transfer artefact), or the week spans a gap with no data.
 *
 * @param {Map<string, Object>} monthDataMap
 * @param {string} trainerName
 * @param {Date}   monday  UTC Monday of the week
 * @param {Date}   sunday  UTC Sunday of the week
 * @returns {number|null}
 */
function calcWeeklyFans(monthDataMap, trainerName, monday, sunday) {
  const mondayMonth = monday.getUTCMonth();
  const sundayMonth = sunday.getUTCMonth();

  const monValue = getDailyFansValue(monthDataMap, trainerName, monday);
  const sunValue = getDailyFansValue(monthDataMap, trainerName, sunday);

  if (monValue === null || sunValue === null) return null;

  let weeklyFans;

  if (mondayMonth === sundayMonth) {
    // Same month — straightforward difference
    weeklyFans = sunValue - monValue;
  } else {
    // Cross-month: fans in prev-month part + fans in curr-month part.
    // daily_fans is always cumulative and never resets at month boundaries.
    // fans_prev_part  = nextMonthStart - monValue
    // fans_curr_part  = sunValue - firstDayOfSundayMonth  (first day of new month)
    const nextMonthStart = getNextMonthStart(monthDataMap, trainerName, monday);
    if (nextMonthStart === null) return null;
    const firstOfSundayMonth = new Date(Date.UTC(sunday.getUTCFullYear(), sunday.getUTCMonth(), 1));
    const firstDayValue = getDailyFansValue(monthDataMap, trainerName, firstOfSundayMonth);
    if (firstDayValue === null || firstDayValue <= 0) return null;
    weeklyFans = (nextMonthStart - monValue) + (sunValue - firstDayValue);
  }

  // Negative result means the member transferred in during this week — skip
  if (weeklyFans < 0) return null;
  // Negative Monday value means transfer artefact — skip
  if (monValue < 0) return null;

  return weeklyFans;
}

/**
 * Run the full history import.
 *
 * @returns {Promise<{ totalInserted: number, skipped: number, perMember: Map<string,number>, errors: string[] }>}
 */
async function runImportHistory() {
  const circleId = getSetting('uma_circle_id') || DEFAULT_CIRCLE_ID;

  // Determine the 3 months to fetch (current + 2 previous), in UTC
  const now = new Date();
  const months = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }

  // Fetch API data for each month; store in a map keyed by "YYYY-M"
  const monthDataMap = new Map();
  const errors = [];

  for (const { year, month } of months) {
    try {
      const data = await fetchCircleData(circleId, year, month);
      monthDataMap.set(`${year}-${month}`, data);
    } catch (err) {
      errors.push(`Failed to fetch ${year}-${month}: ${err.message}`);
    }
  }

  if (monthDataMap.size === 0) {
    throw new Error('Could not fetch any month data from uma.moe.');
  }

  // Collect every unique trainer name across all fetched months
  const allTrainerNames = new Set();
  for (const data of monthDataMap.values()) {
    for (const m of data.members) {
      allTrainerNames.add(m.trainer_name);
    }
  }

  // Match trainer names → DB members (or auto-register)
  const dbMembers = getAllMembers();
  const trainerToMember = new Map();

  for (const trainerName of allTrainerNames) {
    // Skip blacklisted trainer names — don't auto-register them
    if (isBlacklisted(trainerName)) continue;

    let dbMember = dbMembers.find(m =>
      (m.uma_trainer_name &&
        m.uma_trainer_name.toLowerCase() === trainerName.toLowerCase()) ||
      m.in_game_name.toLowerCase() === trainerName.toLowerCase()
    );
    if (!dbMember) {
      try {
        dbMember = autoRegisterMember(trainerName);
      } catch (registerErr) {
        // Auto-registration failed (e.g. DB constraint); skip this trainer
        console.warn(`import-history: could not auto-register "${trainerName}":`, registerErr.message);
      }
    }
    if (dbMember) trainerToMember.set(trainerName, dbMember);
  }

  // Determine the current ISO week label so we can skip it
  const currentWeekLabel = getWeekLabel(now);

  // Monday of the current week (UTC)
  const thisWeekMonday = getMondayOfWeek(now);

  // Oldest month boundary: first day of the oldest fetched month
  const oldestMonth = months[months.length - 1];
  const oldestBoundary = new Date(Date.UTC(oldestMonth.year, oldestMonth.month - 1, 1));

  // Enumerate complete ISO weeks from 1 week ago back to the oldest boundary
  let totalInserted = 0;
  let skipped = 0;
  const perMember = new Map();
  const thresholds = getThresholds();
  const affectedMembers = new Set();

  // Walk backwards, week by week, until the Monday is before our oldest data
  const weekMonday = new Date(thisWeekMonday);
  weekMonday.setUTCDate(weekMonday.getUTCDate() - 7); // start one week before current

  while (weekMonday >= oldestBoundary) {
    const monday = new Date(weekMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const weekLabel = getWeekLabel(monday);

    // Double-check: skip current (incomplete) week
    if (weekLabel !== currentWeekLabel) {
      for (const [trainerName, dbMember] of trainerToMember) {
        const discordUserId = dbMember.discord_user_id;

        // Skip if this week is already in the DB
        if (weekHistoryExists(discordUserId, weekLabel)) {
          skipped++;
          continue;
        }

        const fans = calcWeeklyFans(monthDataMap, trainerName, monday, sunday);
        if (fans === null) continue; // no data or invalid

        const status = calculateStatus(fans, thresholds);
        addWeeklyHistory(discordUserId, weekLabel, fans, status);
        totalInserted++;
        affectedMembers.add(discordUserId);
        perMember.set(discordUserId, (perMember.get(discordUserId) ?? 0) + 1);
      }
    }

    // Go back one more week
    weekMonday.setUTCDate(weekMonday.getUTCDate() - 7);
  }

  // Recalculate streaks for every member that received new history entries
  for (const discordUserId of affectedMembers) {
    recalculateStreaksFromHistory(discordUserId);
  }

  return { totalInserted, skipped, perMember, errors };
}

// ---------------------------------------------------------------------------
// Discord slash command
// ---------------------------------------------------------------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('import-history')
    .setDescription('(Officers) Backfill weekly_history from uma.moe for the last ~8 weeks.'),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await runImportHistory();

      const memberLines = result.perMember.size > 0
        ? [...result.perMember.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, count]) => `• <@${id}>: ${count} week(s)`)
          .join('\n')
        : '• (none)';

      const errorBlock = result.errors.length > 0
        ? '\n\n⚠️ Errors:\n' + result.errors.map(e => `• ${e}`).join('\n')
        : '';

      const content = [
        '✅ **History Import Complete**',
        '',
        `📥 Weeks inserted : ${result.totalInserted}`,
        `⏭️ Weeks skipped  : ${result.skipped} (already present)`,
        `👥 Members updated: ${result.perMember.size}`,
        '',
        '**Per-member breakdown:**',
        memberLines,
        errorBlock,
      ].join('\n').trim();

      await interaction.editReply({ content });
    } catch (err) {
      console.error('import-history command failed:', err);
      await interaction.editReply({ content: `❌ Import failed: ${err.message}` });
    }
  },
};
