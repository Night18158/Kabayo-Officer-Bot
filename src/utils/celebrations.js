const { getSetting, getMemberAllTimeBest, getMemberGreenCount } = require('../database');
const { formatFans } = require('./formatters');
const { trySend } = require('./scheduledMessages');

/**
 * Check for and post auto-celebration milestones when a member's fans are updated.
 * Checks: Personal Record, First GREEN.
 *
 * @param {import('discord.js').Client} client
 * @param {Object} member - The DB member row (before update)
 * @param {number} newFans - The new fan count
 * @param {string} newStatus - The new status ('GREEN'|'YELLOW'|'RED')
 */
async function checkAndPostCelebrations(client, member, newFans, newStatus) {
  const trackerChannel = getSetting('channel_tracker');
  if (!trackerChannel || !client) return;

  // Personal record: new fans > all-time best in weekly history
  const allTimeBest = getMemberAllTimeBest(member.discord_user_id);
  if (newFans > allTimeBest && newFans > 0) {
    await trySend(
      client,
      trackerChannel,
      `🎉 **Personal Record!** ${member.in_game_name} just set a new PR: **${formatFans(newFans)}**!`
    );
  }

  // First GREEN: member just reached GREEN for the first time
  if (newStatus === 'GREEN') {
    const greenCount = getMemberGreenCount(member.discord_user_id);
    if (greenCount === 0) {
      await trySend(
        client,
        trackerChannel,
        `🎯 **First GREEN!** Welcome to the green zone, **${member.in_game_name}**! 🟢`
      );
    }
  }
}

/**
 * Post streak milestone celebrations after a week close.
 * Should be called AFTER resetWeeklyFans() with the PRE-RESET member data.
 *
 * @param {import('discord.js').Client} client
 * @param {Array} preResetMembers - Member rows before the weekly reset
 */
async function postStreakMilestones(client, preResetMembers) {
  const trackerChannel = getSetting('channel_tracker');
  if (!trackerChannel || !client) return;

  const { getThresholds } = require('../database');
  const thresholds = getThresholds();

  for (const m of preResetMembers) {
    // Calculate what the new streak values will be after reset
    const newTargetStreak = m.weekly_fans_current >= thresholds.streak_target_threshold
      ? m.streak_target_weeks + 1
      : 0;
    const newEliteStreak = m.weekly_fans_current >= thresholds.elite_fans
      ? m.streak_elite_weeks + 1
      : 0;

    // Target streak milestones: 5, 10, 15, 20...
    if (newTargetStreak > 0 && newTargetStreak % 5 === 0) {
      await trySend(
        client,
        trackerChannel,
        `⭐ **${newTargetStreak}-Week Streak!** ${m.in_game_name} has maintained ${formatFans(thresholds.streak_target_threshold)}+ for **${newTargetStreak}** consecutive weeks!`
      );
    }

    // Elite streak milestones: 3 first, then every 5 (5, 10, 15, 20...)
    if (newEliteStreak === 3 || (newEliteStreak > 3 && newEliteStreak % 5 === 0)) {
      await trySend(
        client,
        trackerChannel,
        `🏆 **Triple Crown!** ${m.in_game_name} achieved Elite for **${newEliteStreak}** weeks in a row!`
      );
    }
  }
}

module.exports = { checkAndPostCelebrations, postStreakMilestones };
