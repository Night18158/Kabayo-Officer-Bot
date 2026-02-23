/**
 * Format a fan count number into a human-readable string.
 * e.g. 4200000 → "4.2M", 850000 → "850K"
 * @param {number} number
 * @returns {string}
 */
function formatFans(number) {
  if (number >= 1_000_000) {
    const val = number / 1_000_000;
    return `${parseFloat(val.toFixed(2).replace(/\.?0+$/, ''))}M`;
  }
  if (number >= 1_000) {
    const val = number / 1_000;
    return `${parseFloat(val.toFixed(1).replace(/\.?0+$/, ''))}K`;
  }
  return String(number);
}

/**
 * Format a number with locale commas.
 * e.g. 4200000 → "4,200,000"
 * @param {number} number
 * @returns {string}
 */
function formatNumber(number) {
  return number.toLocaleString('en-US');
}

module.exports = { formatFans, formatNumber };
