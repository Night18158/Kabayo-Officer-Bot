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
 * 3. Auto-register unmatched members
 * 4. Calculate weekly fans for each member
 * 5. Update members only if new fan count is higher than current
 * @returns {Promise<{ imported: number, skipped: number, unmatched: string[], errors: string[], total: number, autoRegistered: number }>}
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
        weekStartDay,
        currentDay
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

module.exports = { fetchCircleData, calculateWeeklyFans, runAutoImport, DEFAULT_CIRCLE_ID };
