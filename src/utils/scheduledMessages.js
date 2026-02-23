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
    'Use `/submit fans:<number>` to log your weekly fans.',
    '',
    "Let's have a strong week everyone! 🔥",
  ].join('\n');
  await trySend(client, channelId, msg);
}

/**
 * Post the midweek checkpoint in channel_tracker and DM at-risk members.
 * @param {import('discord.js').Client} client
 */
async function postMidweekCheckpoint(client) {
  const channelId = getSetting('channel_tracker');
  const { avg, green, yellow, red, noSub } = calcStats();

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
      'No pressure — just a reminder that a small push before Sunday helps the whole team stay Top 500. 🤙',
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
  const { avg } = calcStats();

  const msg = [
    '🔥 **KABAYO FAN PUSH DAY** 🔥',
    '',
    `Current Guild Average: ${formatFans(Math.round(avg))}`,
    'Top 500 Stable Target: 4.8M',
    '',
    'Today is our team push day.',
    'Even +300K helps the guild massively.',
    '',
    "Let's finish strong! 🏇",
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

  const msg = [
    '⏰ **Push Day Update**',
    '',
    `Guild Average: ${formatFans(Math.round(avg))}`,
    'Hours remaining: ~5',
    '',
    `🟢 ${green} already GREEN`,
    `🟡 ${yellow} on track`,
    `🔴 ${red} still need a push`,
    `📭 ${noSub} haven't submitted yet`,
    '',
    'Every submission counts. Let\'s go! 💪',
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
      '⏰ Final reminder — the week closes in ~1 hour!',
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

module.exports = {
  trySend,
  postNewWeekMessage,
  postMidweekCheckpoint,
  postPushDayMorning,
  postPushDayEvening,
  sendFinalPushDMs,
  sendWeekCloseWarningDMs,
};
