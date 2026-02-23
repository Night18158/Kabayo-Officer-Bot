const { formatFans } = require('./formatters');

/**
 * Calculate a member's status based on their fan count.
 * @param {number} fans
 * @param {{ min_fans: number, target_fans: number }} thresholds
 * @returns {'GREEN'|'YELLOW'|'RED'}
 */
function calculateStatus(fans, thresholds) {
  if (fans >= thresholds.target_fans) return 'GREEN';
  if (fans >= thresholds.min_fans) return 'YELLOW';
  return 'RED';
}

/**
 * @param {'GREEN'|'YELLOW'|'RED'} status
 * @returns {string}
 */
function getStatusEmoji(status) {
  switch (status) {
    case 'GREEN': return '🟢';
    case 'YELLOW': return '🟡';
    case 'RED': return '🔴';
    default: return '⚪';
  }
}

/**
 * @param {'GREEN'|'YELLOW'|'RED'} status
 * @returns {string}
 */
function getStatusLabel(status) {
  switch (status) {
    case 'GREEN': return 'Strong Performance';
    case 'YELLOW': return 'On Track';
    case 'RED': return 'Needs Attention';
    default: return 'Unknown';
  }
}

/**
 * Returns a string describing how many more fans are needed for the next tier.
 * @param {number} fans
 * @param {{ min_fans: number, target_fans: number }} thresholds
 * @returns {string}
 */
function fansNeededForNext(fans, thresholds) {
  if (fans >= thresholds.target_fans) {
    return '✅ Already at GREEN (target reached)';
  }
  if (fans >= thresholds.min_fans) {
    const needed = thresholds.target_fans - fans;
    return `Fans needed for GREEN: +${formatFans(needed)}`;
  }
  const needed = thresholds.min_fans - fans;
  return `Fans needed for YELLOW: +${formatFans(needed)}`;
}

module.exports = { calculateStatus, getStatusEmoji, getStatusLabel, fansNeededForNext };
