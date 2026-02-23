const {
  getAllMembers,
  getThresholds,
  getSetting,
  setSetting,
  submitFans,
  autoRegisterMember,
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
 * Run the full auto-import process:
 * 1. Fetch data from uma.moe
 * 2. Match trainer_name with bot's in_game_name or uma_trainer_name
 * 3. Auto-register unmatched members
 * 4. Calculate weekly fans for each member
 * 5. Update members only if new fan count is higher than current
 * @returns {Promise<{ imported: number, skipped: number, unmatched: string[], errors: string[], total: number, autoRegistered: number }>}
 */
async function runAutoImport() {
  const circleId = getSetting('uma_circle_id') || DEFAULT_CIRCLE_ID;
  const now = new Date();

  // Calculate JST time (UTC+9) — used only for determining which month to fetch
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const fetchYear = jstNow.getUTCFullYear();
  const fetchMonth = jstNow.getUTCMonth() + 1;

  const data = await fetchCircleData(circleId, fetchYear, fetchMonth);
  const allMembers = getAllMembers();

  let imported = 0;
  let skipped = 0;
  let autoRegistered = 0;
  const unmatched = [];
  const errors = [];

  for (const umaMember of data.members) {
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
      const weeklyFans = calculateWeeklyFans(
        umaMember.daily_fans,
        fetchYear,
        fetchMonth
      );
      // Only update if new value is higher than what's currently stored
      if (weeklyFans > dbMember.weekly_fans_current) {
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

  return { imported, skipped, unmatched, errors, total: data.members.length, autoRegistered };
}

module.exports = { fetchCircleData, findLastDataIndex, findWeekBaseIndex, calculateWeeklyFans, runAutoImport, DEFAULT_CIRCLE_ID };
