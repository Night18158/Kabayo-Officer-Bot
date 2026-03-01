const { EmbedBuilder } = require('discord.js');
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
const { fetchCircleData, DEFAULT_CIRCLE_ID } = require('./umaImport');

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
 * Build a text progress bar.
 * @param {number} current
 * @param {number} total
 * @param {number} [length=10]
 * @returns {string} e.g. "[████████░░] 80%"
 */
function buildProgressBar(current, total, length = 10) {
  if (total === 0) return '[░░░░░░░░░░] 0%';
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${pct}%`;
}

/**
 * Attempt to send a message to a channel by ID.
 * Returns { success: true } on success or { success: false, reason: string } on failure.
 * Accepts either a plain string or a Discord message options object.
 * @param {import('discord.js').Client} client
 * @param {string|null} channelId
 * @param {string|Object} messageOptions
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function trySend(client, channelId, messageOptions) {
  if (!channelId) {
    console.warn('scheduledMessages: no channel ID configured — skipping');
    return { success: false, reason: 'No channel configured. Use `/set-channels` first.' };
  }
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      const opts = typeof messageOptions === 'string' ? { content: messageOptions } : messageOptions;
      await channel.send(opts);
      return { success: true };
    }
    return { success: false, reason: `Channel <#${channelId}> is not a text channel.` };
  } catch (err) {
    console.error(`scheduledMessages: failed to send to channel ${channelId}:`, err.message);
    return { success: false, reason: `Failed: ${err.message}` };
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
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function postNewWeekMessage(client) {
  const channelId = getSetting('channel_tracker');
  const weekLabel = getCurrentWeekLabel();
  const thresholds = getThresholds();
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🏇 New Kabayo Week Started!')
    .addFields(
      { name: 'Week', value: weekLabel, inline: false },
      {
        name: '📋 Weekly Targets',
        value: [
          `🟢 Target (GREEN): ${formatFans(thresholds.target_fans)}+`,
          `🟡 Minimum (YELLOW): ${formatFans(thresholds.min_fans)}`,
          `⚡ Elite: ${formatFans(thresholds.elite_fans)}+`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'ℹ️ Info',
        value: 'Fans are tracked automatically from uma.moe.\nOfficers can manually adjust with `/submit` or `/set-fans` if needed.',
        inline: false,
      }
    )
    .setFooter({ text: "Let's have a strong week everyone! 🔥" })
    .setTimestamp();
  return trySend(client, channelId, { embeds: [embed] });
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

/** Medal emojis for top 3. */
const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Format the top 3 performers as a string for embed fields.
 * @returns {string}
 */
function formatTop3Text() {
  const top3 = getAllMembers().filter(m => m.weekly_fans_current > 0).slice(0, 3);
  if (top3.length === 0) return 'No submissions yet';
  return top3.map((m, i) => `${MEDALS[i]} **${m.in_game_name}** — ${formatFans(m.weekly_fans_current)}`).join('\n');
}

/**
 * Post the midweek checkpoint in channel_tracker and DM at-risk members.
 * @param {import('discord.js').Client} client
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function postMidweekCheckpoint(client) {
  const channelId = getSetting('channel_tracker');
  const { avg, green, yellow, red, noSub, memberCount } = calcStats();
  const { formatted: countdown } = getTimeUntilReset();

  const top3Text = formatTop3Text();

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle('📊 Midweek Checkpoint')
    .addFields(
      { name: '📈 Guild Average', value: `${formatFans(Math.round(avg))} / 4.8M target`, inline: false },
      {
        name: '📊 Status Breakdown',
        value: [
          `🟢 GREEN: **${green}**  🟡 YELLOW: **${yellow}**`,
          `🔴 RED: **${red}**  📭 No submission: **${noSub}**`,
          buildProgressBar(green, memberCount),
          `${green}/${memberCount} members GREEN`,
        ].join('\n'),
        inline: false,
      },
      { name: '⏳ Time Remaining', value: `${countdown} until weekly reset`, inline: false },
      { name: '🏆 Top 3', value: top3Text, inline: false }
    )
    .setFooter({ text: 'Still plenty of time — small daily runs make the difference! 💪' })
    .setTimestamp();

  const result = await trySend(client, channelId, { embeds: [embed] });

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

  return result;
}

/**
 * Post the Push Day morning message in channel_push.
 * @param {import('discord.js').Client} client
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function postPushDayMorning(client) {
  const channelId = getSetting('channel_push');
  const { avg, green, memberCount } = calcStats();
  const { formatted: countdown } = getTimeUntilReset();
  const needGreen = memberCount - green;

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🔥 KABAYO FAN PUSH DAY 🔥')
    .addFields(
      { name: '📈 Current Guild Average', value: formatFans(Math.round(avg)), inline: true },
      { name: '🎯 Target', value: '4.8M', inline: true },
      { name: '⏳ Time Remaining', value: `${countdown} until weekly reset`, inline: false },
      {
        name: '📊 Progress',
        value: [
          buildProgressBar(green, memberCount),
          `${green}/${memberCount} members GREEN — **${needGreen}** still need a push`,
        ].join('\n'),
        inline: false,
      }
    )
    .setDescription(
      'Today is our team push day.\nEven +300K helps the guild massively.\n\n' + randomMotivation()
    )
    .setTimestamp();
  return trySend(client, channelId, { embeds: [embed] });
}

/**
 * Post the Push Day evening update in channel_push.
 * @param {import('discord.js').Client} client
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function postPushDayEvening(client) {
  const channelId = getSetting('channel_push');
  const { avg, green, yellow, red, noSub, memberCount } = calcStats();
  const { formatted: countdown } = getTimeUntilReset();

  const top3Text = formatTop3Text();

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('⏰ Push Day Update')
    .addFields(
      { name: '📈 Guild Average', value: formatFans(Math.round(avg)), inline: true },
      { name: '⏳ Time Remaining', value: `${countdown} until weekly reset`, inline: true },
      {
        name: '📊 Status Breakdown',
        value: [
          `🟢 ${green} already GREEN  🟡 ${yellow} on track`,
          `🔴 ${red} still need a push  📭 ${noSub} haven't submitted yet`,
          buildProgressBar(green, memberCount),
        ].join('\n'),
        inline: false,
      },
      { name: '🏆 Top 3', value: top3Text, inline: false }
    )
    .setFooter({ text: randomMotivation() })
    .setTimestamp();
  return trySend(client, channelId, { embeds: [embed] });
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
 * Post a daily fan update to channel_push showing 24h gains per member,
 * top 3 performers, time until reset, and a random motivational message.
 * Fetches live data from the uma.moe API (same as /daily-diff).
 * @param {import('discord.js').Client} client
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function postDailyFanUpdate(client) {
  const channelId = getSetting('channel_push');
  const { formatted: countdown } = getTimeUntilReset();

  // Calculate JST date
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(Date.now() + jstOffset);
  const fetchYear = jstNow.getUTCFullYear();
  const fetchMonth = jstNow.getUTCMonth() + 1;
  const jstDay = jstNow.getUTCDate();
  const dayOfWeek = jstNow.getUTCDay();

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateLabel = `${DAY_NAMES[dayOfWeek]}, ${jstDay} ${MONTH_NAMES_SHORT[fetchMonth - 1]}`;

  const todayIdx = jstDay - 1;
  const yesterdayIdx = todayIdx - 1;

  const circleId = getSetting('uma_circle_id') || DEFAULT_CIRCLE_ID;
  let data, prevData = null;

  try {
    data = await fetchCircleData(circleId, fetchYear, fetchMonth);

    // Month boundary: if today is day 1, fetch previous month for yesterday's value
    if (todayIdx === 0) {
      const prevMonth = fetchMonth === 1 ? 12 : fetchMonth - 1;
      const prevYear = fetchMonth === 1 ? fetchYear - 1 : fetchYear;
      try {
        prevData = await fetchCircleData(circleId, prevYear, prevMonth);
      } catch (_) {
        // Previous month data unavailable — yesterday's value will be 0
      }
    }
  } catch (err) {
    console.error('postDailyFanUpdate: failed to fetch uma.moe data:', err.message);
    const fallbackEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`📈 Daily Fan Update — ${dateLabel}`)
      .setDescription('⚠️ Unable to fetch fan data from uma.moe. Please check back later.')
      .setFooter({ text: `${randomMotivation()} • ⏳ ${countdown} until reset` })
      .setTimestamp();
    return trySend(client, channelId, { embeds: [fallbackEmbed] });
  }

  // Check if any members have today's data
  const hasAnyData = data.members.some(m => m.daily_fans && m.daily_fans[todayIdx] > 0);

  if (!hasAnyData) {
    const noDataEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`📈 Daily Fan Update — ${dateLabel}`)
      .setDescription(`No fan data available for today (${MONTH_NAMES_SHORT[fetchMonth - 1]} ${jstDay}) yet. Data is usually updated once a day.`)
      .setFooter({ text: `${randomMotivation()} • ⏳ ${countdown} until reset` })
      .setTimestamp();
    return trySend(client, channelId, { embeds: [noDataEmbed] });
  }

  // Calculate 24h gains for each member
  const gains = [];
  let guildTotalGains = 0;

  for (const m of data.members) {
    if (!m.daily_fans || m.daily_fans[todayIdx] == null) continue;

    const todayVal = m.daily_fans[todayIdx] || 0;
    let yesterdayVal = 0;

    if (todayIdx === 0) {
      // Month boundary: use prev month's next_month_start as yesterday's baseline
      if (prevData) {
        const prevMember = prevData.members.find(p =>
          p.trainer_name.toLowerCase() === m.trainer_name.toLowerCase()
        );
        yesterdayVal = prevMember?.next_month_start ?? 0;
      }
    } else {
      yesterdayVal = m.daily_fans[yesterdayIdx] || 0;
    }

    const diff = todayVal - yesterdayVal;
    gains.push({ name: m.trainer_name, diff });
    if (diff > 0) guildTotalGains += diff;
  }

  // Sort highest gains first
  gains.sort((a, b) => b.diff - a.diff);

  const activeGains = gains.filter(m => m.diff > 0);
  const noActivity = gains.filter(m => m.diff <= 0);

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`📈 Daily Fan Update — ${dateLabel}`)
    .addFields({ name: '📊 Guild Today', value: `+${formatFans(guildTotalGains)} total gained`, inline: false });

  // Top 3 gainers with medals
  if (activeGains.length > 0) {
    const top3Lines = activeGains.slice(0, 3).map((m, i) => `${MEDALS[i]} **${m.name}** — +${formatFans(m.diff)}`);
    embed.addFields({ name: '🏆 Top Gainers (24h)', value: top3Lines.join('\n'), inline: false });
  }

  // All members list sorted by 24h gains descending — split into chunks to stay under Discord's 1024-char field limit
  if (gains.length > 0) {
    const allLines = gains.map(m => `• **${m.name}** — ${m.diff > 0 ? '+' : ''}${formatFans(m.diff)}`);
    const chunks = [];
    let current = '';
    for (const line of allLines) {
      const next = current ? `${current}\n${line}` : line;
      if (next.length > 1024) {
        chunks.push(current);
        current = line;
      } else {
        current = next;
      }
    }
    if (current) chunks.push(current);

    for (let i = 0; i < chunks.length; i++) {
      const fieldName = i === 0 ? '📋 All Members (24h gains)' : '📋 (continued)';
      embed.addFields({ name: fieldName, value: chunks[i], inline: false });
    }
  }

  // No activity section
  if (noActivity.length > 0) {
    const noActivityLines = noActivity.map(m => `• ${m.name}`);
    const noActivityText = noActivityLines.join('\n').slice(0, 1024);
    embed.addFields({ name: '⚠️ No activity (0 gains today)', value: noActivityText, inline: false });
  }

  embed
    .setFooter({ text: `${randomMotivation()} • ⏳ ${countdown} until reset` })
    .setTimestamp();

  return trySend(client, channelId, { embeds: [embed] });
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
