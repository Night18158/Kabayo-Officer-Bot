const {
  getAllMembers,
  getThresholds,
  getSetting,
  setSetting,
  submitFans,
  autoRegisterMember,
  isBlacklisted,
} = require('../database');
const { calculateStatus } = require('./statusLogic');

const DEFAULT_CIRCLE_ID = '303280917';

/**
 * Fetch circle data from uma.moe API
 * @param {string} circleId - The circle ID
 * @param {number} year - Year to fetch
 * @param {number} month - Month to fetch
 * @returns {Promise<Object>}
 */
async function fetchCircleData(circleId, year, month) {
  const url = `https://uma.moe/api/v4/circles?circle_id=${circleId}&year=${year}&month=${month}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`uma.moe API returned ${response.status}`);
  return response.json();
}

/**
 * Walk backwards through dailyFans to find the last index with value > 0.
 * @param {number[]} dailyFans
 * @returns {number} Last index with data, or -1 if none
 */
function findLastDataIndex(dailyFans) {
  for (let i = dailyFans.length - 1; i >= 0; i--) {
    if (dailyFans[i] > 0) return i;
  }
  return -1;
}

/**
 * Find the 0-indexed baseline day (Sunday before the Monday of the week
 * that contains lastDataIndex).
 * @param {number} year
 * @param {number} month - 1-indexed
 * @param {number} lastDataIndex - 0-indexed day of month
 * @returns {number} 0-indexed baseline index (may be negative if before month start)
 */
function findWeekBaseIndex(year, month, lastDataIndex) {
  const day = lastDataIndex + 1; // 1-indexed day of month
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const mondayDay = day - daysSinceMonday;
  const sundayDay = mondayDay - 1; // Sunday before the week's Monday
  return sundayDay - 1; // convert to 0-indexed
}

/**
 * Calculate weekly fans from a cumulative daily_fans array.
 * Uma week = Monday 04:00 JST to next Monday 04:00 JST.
 * daily_fans is indexed by day of month (0-indexed: index 0 = day 1).
 * @param {number[]} dailyFans - Array of cumulative total fans per day of month
 * @param {number} year
 * @param {number} month - 1-indexed
 * @returns {number} Weekly fans gained
 */
function calculateWeeklyFans(dailyFans, year, month) {
  const lastIndex = findLastDataIndex(dailyFans);
  if (lastIndex < 0) return 0;

  let baseIndex = findWeekBaseIndex(year, month, lastIndex);

  // Edge case: week started at/before beginning of month — use day 1 as fallback
  if (baseIndex < 0) {
    baseIndex = 0;
  }

  // Edge case: member transferred mid-month with no data at base day
  if (!(dailyFans[baseIndex] > 0)) {
    let found = -1;
    for (let i = baseIndex + 1; i <= lastIndex; i++) {
      if (dailyFans[i] > 0) { found = i; break; }
    }
    if (found < 0) return 0;
    baseIndex = found;
  }

  const result = dailyFans[lastIndex] - dailyFans[baseIndex];
  return result < 0 ? 0 : result;
}

/**
 * Calculate weekly fans for a member, handling cross-month week boundaries.
 * When the week's baseline Sunday falls in the previous month, combine data
 * from both months using `next_month_start` as the bridge value.
 * @param {number[]} currDailyFans - Current month's daily_fans array
 * @param {number} currYear
 * @param {number} currMonth - 1-indexed
 * @param {number[]|null} prevDailyFans - Previous month's daily_fans array (or null)
 * @param {number|null} nextMonthStart - Previous month's next_month_start bridge value
 * @param {number} prevYear
 * @param {number} prevMonth - 1-indexed
 * @returns {number} Weekly fans gained
 */
function calculateCrossMonthWeeklyFans(currDailyFans, currYear, currMonth, prevDailyFans, nextMonthStart, prevYear, prevMonth) {
  // Try current month calculation first
  const currFans = calculateWeeklyFans(currDailyFans, currYear, currMonth);
  if (currFans > 0 || !prevDailyFans) return currFans;

  // Current month gave 0 — check if baseline falls in previous month
  const currLastIdx = findLastDataIndex(currDailyFans);
  const currBaseIdx = currLastIdx >= 0 ? findWeekBaseIndex(currYear, currMonth, currLastIdx) : -1;

  // If base is in current month but still 0, just return 0
  if (currBaseIdx >= 0) return 0;

  // Baseline falls in previous month — try previous month alone
  const prevFans = calculateWeeklyFans(prevDailyFans, prevYear, prevMonth);

  // If next_month_start is available, try cross-month combination
  if (nextMonthStart != null && nextMonthStart >= 0) {
    // Use current month's week context to find the correct baseline day in the previous month.
    // currBaseIdx < 0 means the Sunday baseline falls before the 1st of the current month.
    // Map it into the previous month: e.g. currBaseIdx=-1 → last day of prev month, etc.
    const daysInPrevMonth = new Date(Date.UTC(currYear, currMonth - 1, 0)).getUTCDate();
    let prevBaseIdx = daysInPrevMonth + currBaseIdx; // currBaseIdx is negative
    if (prevBaseIdx < 0) prevBaseIdx = 0;
    if (prevDailyFans[prevBaseIdx] > 0) {
      // Current month portion: incremental gains within the new month only.
      // daily_fans[0] is the cumulative value at the start of the month (not incremental gains).
      // If we only have day 1 of data (currLastIdx === 0), there are no incremental
      // gains within the month yet, so currPortion = 0.
      // If we have multiple days, currPortion = daily_fans[lastDay] - daily_fans[0].
      let currPortion = 0;
      if (currLastIdx > 0) {
        currPortion = currDailyFans[currLastIdx] - (currDailyFans[0] || 0);
      }
      const crossMonthFans = (nextMonthStart - prevDailyFans[prevBaseIdx]) + currPortion;
      return Math.max(0, crossMonthFans, prevFans);
    }
  }

  return Math.max(0, prevFans);
}

/**
 * Run the full auto-import process:
 * 1. Fetch data from uma.moe (current month + previous month if in first 7 days)
 * 2. Match trainer_name with bot's in_game_name or uma_trainer_name
 * 3. Auto-register unmatched members
 * 4. Calculate weekly fans for each member (handles cross-month boundaries)
 * 5. Update members only if new fan count is higher than current
 * @returns {Promise<{ imported: number, skipped: number, unmatched: string[], errors: string[], total: number, autoRegistered: number, blacklisted: number }>}
 */
async function runAutoImport() {
  const circleId = getSetting('uma_circle_id') || DEFAULT_CIRCLE_ID;
  const now = new Date();

  // Calculate JST time (UTC+9) — used only for determining which month to fetch
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const fetchYear = jstNow.getUTCFullYear();
  const fetchMonth = jstNow.getUTCMonth() + 1;
  const jstDay = jstNow.getUTCDate();

  // Compute previous month's year/month
  const prevMonth = fetchMonth === 1 ? 12 : fetchMonth - 1;
  const prevYear = fetchMonth === 1 ? fetchYear - 1 : fetchYear;

  // Always fetch both months — current may be empty at month boundaries
  let currentData, prevData;
  try {
    currentData = await fetchCircleData(circleId, fetchYear, fetchMonth);
  } catch (e) {
    console.error(`Failed to fetch current month (${fetchYear}-${fetchMonth}):`, e.message);
    currentData = { members: [] };
  }
  try {
    prevData = await fetchCircleData(circleId, prevYear, prevMonth);
  } catch (e) {
    console.error(`Failed to fetch prev month (${prevYear}-${prevMonth}):`, e.message);
    prevData = { members: [] };
  }

  const currentMembers = (currentData && currentData.members) || [];
  const prevMembers = (prevData && prevData.members) || [];

  // If current month has no data yet (e.g. first days of new month), fall back to previous month
  const umaMembers = currentMembers.length > 0 ? currentMembers : prevMembers;
  const primaryYear = currentMembers.length > 0 ? fetchYear : prevYear;
  const primaryMonth = currentMembers.length > 0 ? fetchMonth : prevMonth;

  // Build a lookup map for the other month's member data
  const secondaryMembers = currentMembers.length > 0 ? prevMembers : currentMembers;
  const secondaryYear = currentMembers.length > 0 ? prevYear : fetchYear;
  const secondaryMonth = currentMembers.length > 0 ? prevMonth : fetchMonth;
  const secondaryMap = new Map();
  for (const m of secondaryMembers) {
    secondaryMap.set(m.trainer_name.toLowerCase(), m);
  }

  const allMembers = getAllMembers();

  let imported = 0;
  let skipped = 0;
  let autoRegistered = 0;
  let blacklisted = 0;
  const unmatched = [];
  const errors = [];

  for (const umaMember of umaMembers) {
    // Skip members on the import blacklist
    if (isBlacklisted(umaMember.trainer_name)) {
      blacklisted++;
      continue;
    }

    let dbMember = allMembers.find(m =>
      (m.uma_trainer_name &&
        m.uma_trainer_name.toLowerCase() === umaMember.trainer_name.toLowerCase()) ||
      m.in_game_name.toLowerCase() === umaMember.trainer_name.toLowerCase()
    );

    // Auto-register if no match found
    if (!dbMember) {
      try {
        dbMember = autoRegisterMember(umaMember.trainer_name);
        autoRegistered++;
      } catch (e) {
        unmatched.push(umaMember.trainer_name);
        errors.push(`Auto-register ${umaMember.trainer_name}: ${e.message}`);
        continue;
      }
    }

    try {
      let weeklyFans;

      const secondaryMember = secondaryMap.get(umaMember.trainer_name.toLowerCase());

      // When using current month as primary, try cross-month calculation in first 7 days
      if (currentMembers.length > 0 && jstDay <= 7 && secondaryMember) {
        weeklyFans = calculateCrossMonthWeeklyFans(
          umaMember.daily_fans, primaryYear, primaryMonth,
          secondaryMember.daily_fans, secondaryMember.next_month_start,
          secondaryYear, secondaryMonth
        );
      } else if (currentMembers.length === 0 && secondaryMember) {
        // Primary is previous month; secondary is current (which is empty) — just use prev month alone
        weeklyFans = calculateWeeklyFans(umaMember.daily_fans, primaryYear, primaryMonth);
      } else {
        weeklyFans = calculateWeeklyFans(umaMember.daily_fans, primaryYear, primaryMonth);
      }

      // Always update on first import after a weekly reset; otherwise only update if higher
      const isPostReset = dbMember.last_submission_source === 'reset';
      if (isPostReset || weeklyFans > dbMember.weekly_fans_current) {
        const thresholds = getThresholds();
        const status = calculateStatus(weeklyFans, thresholds);
        submitFans(dbMember.discord_user_id, weeklyFans, status, 'auto');
        imported++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push(`${umaMember.trainer_name}: ${e.message}`);
    }
  }

  return { imported, skipped, unmatched, errors, total: umaMembers.length, autoRegistered, blacklisted };
}

module.exports = { fetchCircleData, findLastDataIndex, findWeekBaseIndex, calculateWeeklyFans, calculateCrossMonthWeeklyFans, runAutoImport, DEFAULT_CIRCLE_ID };
