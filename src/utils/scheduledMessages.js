const {
  getAllMembers,
  getMembersWithDmEnabled,
  getMembersByStatus,
  getMembersWithNoSubmission,
  getSetting,
  getCurrentWeekLabel,
  getThresholds,
} = require('../database');
const { formatFans } = require('./formatters');
const { getTimeUntilReset } = require('./countdown');

/** Rotating motivational messages used across scheduled posts. */
const MOTIVATIONAL_MESSAGES = [
  "Every run counts — let's keep pushing! 🏇",
  "Small gains add up to big results. You've got this! 💪",
  "Top 500 stays Top 500 because of team effort. Let's go! 🔥",
  "One more training session can make the difference! ⭐",
  "The grind pays off — stay consistent! 🎯",
  "Your effort today keeps the guild strong tomorrow! 🛡️",
  "Together we rise — let's give it our all! 🤝",
  "Champions are made in the daily grind. Keep it up! 🏆",
  "A little push now, big rewards later! 🚀",
  "We believe in you — let's finish strong! 🌟",
];

/** Pick a random motivational message. */
function randomMotivation() {
  return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
}

/**
 * Attempt to send a message to a channel by ID.
 * Silently skips if channelId is not configured or channel is unreachable.
 * @param {import('discord.js').Client} client
 * @param {string|null} channelId
 * @param {string} content
 */
async function trySend(client, channelId, content) {
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      await channel.send({ content });
    }
  } catch (err) {
    console.error(`scheduledMessages: failed to send to channel ${channelId}:`, err.message);
  }
}

/**
 * Calculate guild stats from current member data.
 * @returns {{ total: number, avg: number, green: number, yellow: number, red: number, noSub: number, memberCount: number }}
 */
function calcStats() {
  const members = getAllMembers();
  if (members.length === 0) {
    return { total: 0, avg: 0, green: 0, yellow: 0, red: 0, noSub: 0, memberCount: 0 };
  }
  const total = members.reduce((sum, m) => sum + m.weekly_fans_current, 0);
  const avg = total / members.length;
  const green  = members.filter(m => m.weekly_status === 'GREEN').length;
  const yellow = members.filter(m => m.weekly_status === 'YELLOW').length;
  const red    = members.filter(m => m.weekly_status === 'RED').length;
  const noSub  = members.filter(m => m.weekly_fans_current === 0).length;
  return { total, avg, green, yellow, red, noSub, memberCount: members.length };
}

/**
 * Post the "New Week Started" announcement in channel_tracker.
 * @param {import('discord.js').Client} client
 */
async function postNewWeekMessage(client) {
  const channelId = getSetting('channel_tracker');
  const weekLabel = getCurrentWeekLabel();
  const msg = [
    '🏇 **New Kabayo Week Started!**',
    '',
    `Week: ${weekLabel}`,
    '',
    '**Weekly Targets:**',
    '🟢 Target: 4.8M+',
    '🟡 Minimum: 4.2M',
    '⚡ Elite: 5.5M+',
    '',
    'Fans are tracked automatically from uma.moe.',
    'Officers can manually adjust with `/submit` or `/set-fans` if needed.',
    '',
    "Let's have a strong week everyone! 🔥",
  ].join('\n');
  await trySend(client, channelId, msg);
}

/**
 * Build top 3 performers lines for use in messages.
 * getAllMembers() returns members sorted by weekly_fans_current DESC.
 * @returns {string[]} Array of lines to spread into a message array
 */
function getTop3Lines() {
  const top3 = getAllMembers().filter(m => m.weekly_fans_current > 0).slice(0, 3);
  if (top3.length === 0) return [];
  const lines = ['🏆 **Top 3 this week:**'];
  top3.forEach((m, i) => {
    lines.push(`  ${i + 1}. **${m.in_game_name}** — ${formatFans(m.weekly_fans_current)}`);
  });
  lines.push('');
  return lines;
}

/**
 * Post the midweek checkpoint in channel_tracker and DM at-risk members.
 * @param {import('discord.js').Client} client
 */
async function postMidweekCheckpoint(client) {
  const channelId = getSetting('channel_tracker');
  const { avg, green, yellow, red, noSub } = calcStats();
  const { formatted: countdown } = getTimeUntilReset();

  const msg = [
    '📊 **Midweek Checkpoint**',
    '',
    `Guild Average: ${formatFans(Math.round(avg))}`,
    'Target Average: 4.8M',
    '',
    `🟢 ${green} members already GREEN`,
    `🟡 ${yellow} members on track`,
    `🔴 ${red} members need a push`,
    `📭 ${noSub} members haven't submitted yet`,
    '',
    `⏳ Time remaining: ${countdown} until weekly reset`,
    '',
    ...getTop3Lines(),
    'Still plenty of time — small daily runs make the difference! 💪',
  ].join('\n');
  await trySend(client, channelId, msg);

  // DM at-risk members (RED or no submission)
  const dmEnabled = getMembersWithDmEnabled();
  const allMembers = getAllMembers();
  const memberMap = new Map(allMembers.map(m => [m.discord_user_id, m]));

  for (const m of dmEnabled) {
    const current = memberMap.get(m.discord_user_id);
    if (!current) continue;
    if (current.weekly_status !== 'RED' && current.weekly_fans_current > 0) continue;

    const fansText = current.weekly_fans_current > 0
      ? formatFans(current.weekly_fans_current)
      : 'no submission yet';

    const dmMsg = [
      'Hey! Friendly midweek check 😊',
      '',
      `You're currently at ${fansText}.`,
      'Guild minimum is 4.2M fans.',
      '',
      `⏳ ${countdown} until weekly reset`,
      '',
      'No pressure — just a reminder that a small push helps the whole team stay Top 500. 🤙',
    ].join('\n');

    try {
      const user = await client.users.fetch(m.discord_user_id);
      await user.send({ content: dmMsg });
    } catch (_) {
      // User has DMs disabled or is not reachable — skip silently
    }
  }
}

/**
 * Post the Push Day morning message in channel_push.
 * @param {import('discord.js').Client} client
 */
async function postPushDayMorning(client) {
  const channelId = getSetting('channel_push');
  const { avg, green, yellow, red, noSub, memberCount } = calcStats();
  const { formatted: countdown } = getTimeUntilReset();
  const needGreen = memberCount - green;

  const msg = [
    '🔥 **KABAYO FAN PUSH DAY** 🔥',
    '',
    `Current Guild Average: ${formatFans(Math.round(avg))}`,
    'Top 500 Stable Target: 4.8M',
    '',
    `⏳ Time remaining: ${countdown} until weekly reset`,
    '',
    `📊 ${needGreen} member(s) still need to reach GREEN`,
    '',
    'Today is our team push day.',
    'Even +300K helps the guild massively.',
    '',
    randomMotivation(),
  ].join('\n');
  await trySend(client, channelId, msg);
}

/**
 * Post the Push Day evening update in channel_push.
 * @param {import('discord.js').Client} client
 */
async function postPushDayEvening(client) {
  const channelId = getSetting('channel_push');
  const { avg, green, yellow, red, noSub } = calcStats();
  const { formatted: countdown } = getTimeUntilReset();

  const msg = [
    '⏰ **Push Day Update**',
    '',
    `Guild Average: ${formatFans(Math.round(avg))}`,
    `⏳ Time remaining: ${countdown} until weekly reset`,
    '',
    `🟢 ${green} already GREEN`,
    `🟡 ${yellow} on track`,
    `🔴 ${red} still need a push`,
    `📭 ${noSub} haven't submitted yet`,
    '',
    ...getTop3Lines(),
    randomMotivation(),
  ].join('\n');
  await trySend(client, channelId, msg);
}

/**
 * Send the final push DM to RED/no-submission members with DMs enabled.
 * @param {import('discord.js').Client} client
 */
async function sendFinalPushDMs(client) {
  const dmEnabled = getMembersWithDmEnabled();
  const allMembers = getAllMembers();
  const memberMap = new Map(allMembers.map(m => [m.discord_user_id, m]));

  for (const m of dmEnabled) {
    const current = memberMap.get(m.discord_user_id);
    if (!current) continue;
    if (current.weekly_status !== 'RED' && current.weekly_fans_current > 0) continue;

    const fansText = current.weekly_fans_current > 0
      ? formatFans(current.weekly_fans_current)
      : 'no submission yet';

    const dmMsg = [
      '⏰ Final reminder — 2h until weekly reset!',
      '',
      `Your current fans: ${fansText}`,
      'Status: 🔴 Needs Attention',
      '',
      "A quick session now can make the difference. You've got this! 🔥",
    ].join('\n');

    try {
      const user = await client.users.fetch(m.discord_user_id);
      await user.send({ content: dmMsg });
    } catch (_) {
      // User has DMs disabled — skip silently
    }
  }
}

/**
 * Send week-close warning DMs to RED members based on consecutive red weeks.
 * Must be called AFTER resetWeeklyFans() so consecutive_red_weeks is updated.
 * @param {import('discord.js').Client} client
 */
async function sendWeekCloseWarningDMs(client) {
  const dmEnabled = getMembersWithDmEnabled();

  for (const m of dmEnabled) {
    if (m.consecutive_red_weeks === 0) continue;

    let dmMsg;
    if (m.consecutive_red_weeks === 1) {
      dmMsg = [
        'Hi! This is an automatic guild notice.',
        '',
        'You finished below minimum this week (4.2M).',
        '',
        'This is only a first warning — no action needed yet.',
        'Next week is a fresh start 🤙',
      ].join('\n');
    } else if (m.consecutive_red_weeks === 2) {
      dmMsg = [
        'Hi! This is your second consecutive week below minimum.',
        '',
        'Officers are aware and looking into it.',
        'Feel free to ask for help or tips! 💪',
      ].join('\n');
    } else {
      dmMsg = [
        `Hi! You've been below minimum for ${m.consecutive_red_weeks} consecutive weeks.`,
        '',
        'Please reach out to an officer to discuss how we can help.',
        'We want you on the team! 🤝',
      ].join('\n');
    }

    try {
      const user = await client.users.fetch(m.discord_user_id);
      await user.send({ content: dmMsg });
    } catch (_) {
      // User has DMs disabled — skip silently
    }
  }
}

/**
 * Post a daily fan update to channel_push with guild average, breakdown,
 * top 3 performers, time until reset, and a random motivational message.
 * @param {import('discord.js').Client} client
 */
async function postDailyFanUpdate(client) {
  const channelId = getSetting('channel_push');
  const { avg, green, yellow, red, noSub } = calcStats();
  const { formatted: countdown } = getTimeUntilReset();

  const msg = [
    '📈 **Daily Fan Update**',
    '',
    `Guild Average: ${formatFans(Math.round(avg))}`,
    '',
    `🟢 GREEN: ${green}  🟡 YELLOW: ${yellow}  🔴 RED: ${red}  📭 No submission: ${noSub}`,
    '',
    ...getTop3Lines(),
    `⏳ Time until weekly reset: ${countdown}`,
    '',
    randomMotivation(),
  ].join('\n');
  await trySend(client, channelId, msg);
}

/**
 * Send streak-at-risk DMs to members who have a target streak ≥ 3 weeks
 * but are currently YELLOW or RED and have DM warnings enabled.
 * @param {import('discord.js').Client} client
 */
async function sendStreakAlertDMs(client) {
  const dmEnabled = getMembersWithDmEnabled();

  for (const m of dmEnabled) {
    if (m.streak_target_weeks < 3) continue;
    if (m.weekly_status !== 'YELLOW' && m.weekly_status !== 'RED') continue;

    const dmMsg = [
      '⚠️ **Streak at Risk!**',
      '',
      `You currently have a **${m.streak_target_weeks}-week** target streak.`,
      `This week you're at **${m.weekly_status}** — your streak could break!`,
      '',
      "Push a bit more to protect your streak. You've got this! 🏇",
    ].join('\n');

    try {
      const user = await client.users.fetch(m.discord_user_id);
      await user.send({ content: dmMsg });
    } catch (_) {
      // User has DMs disabled — skip silently
    }
  }
}

module.exports = {
  trySend,
  postNewWeekMessage,
  postMidweekCheckpoint,
  postPushDayMorning,
  postPushDayEvening,
  sendFinalPushDMs,
  sendWeekCloseWarningDMs,
  postDailyFanUpdate,
  sendStreakAlertDMs,
};
