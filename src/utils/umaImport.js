const {
  getAllMembers,
  getThresholds,
  getSetting,
  setSetting,
  submitFans,
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
  const url = `https://uma.moe/circle/circle_id=${circleId}&year=${year}&month=${String(month).padStart(2, '0')}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`uma.moe API returned ${response.status}`);
  return response.json();
}

/**
 * Calculate weekly fans from daily_fans array.
 * Uma week = Monday 04:00 JST to next Monday 04:00 JST.
 * daily_fans is indexed by day of month (0-indexed: index 0 = day 1).
 * @param {number[]} dailyFans - Array of cumulative total fans per day of month
 * @param {number} weekStartDay - 1-indexed start day of month
 * @param {number} currentDay - 1-indexed current day of month
 * @returns {number} Weekly fans gained
 */
function calculateWeeklyFans(dailyFans, weekStartDay, currentDay) {
  const startIndex = weekStartDay - 1;
  const endIndex = currentDay - 1;

  if (
    startIndex < 0 ||
    endIndex < 0 ||
    startIndex >= dailyFans.length ||
    endIndex >= dailyFans.length
  ) {
    return 0;
  }

  return dailyFans[endIndex] - dailyFans[startIndex];
}

/**
 * Run the full auto-import process:
 * 1. Fetch data from uma.moe
 * 2. Match trainer_name with bot's in_game_name or uma_trainer_name
 * 3. Calculate weekly fans for each member
 * 4. Update members who haven't been manually submitted
 * @returns {Promise<{ imported: number, skipped: number, unmatched: string[], errors: string[], total: number }>}
 */
async function runAutoImport() {
  const circleId = getSetting('uma_circle_id') || DEFAULT_CIRCLE_ID;
  const now = new Date();
  const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const year = jstNow.getFullYear();
  const month = jstNow.getMonth() + 1;
  const currentDay = jstNow.getDate();

  // Calculate week start day (last Monday in JST)
  const dayOfWeek = jstNow.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStartDate = new Date(jstNow);
  weekStartDate.setDate(jstNow.getDate() - daysSinceMonday);
  let weekStartDay = weekStartDate.getDate();

  // Handle month boundary: if week started in previous month,
  // use day 1 of current month as approximation.
  // Limitation: cross-month weekly fan calculation is not supported.
  if (weekStartDay > currentDay) {
    weekStartDay = 1;
  }

  const data = await fetchCircleData(circleId, year, month);
  const allMembers = getAllMembers();

  let imported = 0;
  let skipped = 0;
  const unmatched = [];
  const errors = [];

  for (const umaMember of data.members) {
    const dbMember = allMembers.find(m =>
      (m.uma_trainer_name &&
        m.uma_trainer_name.toLowerCase() === umaMember.trainer_name.toLowerCase()) ||
      m.in_game_name.toLowerCase() === umaMember.trainer_name.toLowerCase()
    );

    if (!dbMember) {
      unmatched.push(umaMember.trainer_name);
      continue;
    }

    // Skip if member was manually submitted this week
    if (dbMember.fan_source === 'manual') {
      skipped++;
      continue;
    }

    try {
      const weeklyFans = calculateWeeklyFans(
        umaMember.daily_fans,
        weekStartDay,
        currentDay
      );
      if (weeklyFans >= 0) {
        const thresholds = getThresholds();
        const status = calculateStatus(weeklyFans, thresholds);
        submitFans(dbMember.discord_user_id, weeklyFans, status, 'auto');
        imported++;
      }
    } catch (e) {
      errors.push(`${umaMember.trainer_name}: ${e.message}`);
    }
  }

  return { imported, skipped, unmatched, errors, total: data.members.length };
}

module.exports = { fetchCircleData, calculateWeeklyFans, runAutoImport, DEFAULT_CIRCLE_ID };
