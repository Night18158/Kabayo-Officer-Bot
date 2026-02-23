const {
  getAllMembers,
  getCurrentWeekLabel,
  resetWeeklyFans,
  addWeeklyHistory,
  getSetting,
  getThresholds,
  getRedWeekSummary,
} = require('../database');
const { getStatusEmoji } = require('./statusLogic');
const { formatFans } = require('./formatters');

/**
 * Attempt to send a message to a channel by ID.
 * Silently ignores errors if the channel is not found or not writable.
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
    console.error(`weekClose: failed to send to channel ${channelId}:`, err.message);
  }
}

/**
 * Find the MVP from a list of pre-reset members.
 * Returns null if no member has fans > 0.
 * @param {Array} members
 * @returns {Object|null}
 */
function findMVP(members) {
  const best = members.reduce(
    (b, m) => (m.weekly_fans_current > (b?.weekly_fans_current ?? 0) ? m : b),
    null
  );
  return best && best.weekly_fans_current > 0 ? best : null;
}

/**
 * Assign Discord roles to guild members based on their weekly performance.
 * Removes all managed roles first, then re-assigns.
 *
 * @param {import('discord.js').Guild} guild
 * @param {Array} members           Pre-reset member rows from DB
 * @param {Object} roleIds          { roleMvp, roleElite, roleCore, roleRisk }
 */
async function assignRoles(guild, members, roleIds) {
  const { roleMvp, roleElite, roleCore, roleRisk } = roleIds;
  const managedRoleIds = [roleMvp, roleElite, roleCore, roleRisk].filter(Boolean);
  if (managedRoleIds.length === 0) return;

  const thresholds = getThresholds();
  const mvp = findMVP(members);

  for (const member of members) {
    try {
      const guildMember = await guild.members.fetch(member.discord_user_id).catch(() => null);
      if (!guildMember) continue;

      // Remove all managed roles
      await guildMember.roles.remove(managedRoleIds).catch(() => {});

      const toAdd = [];

      if (roleMvp && mvp && member.discord_user_id === mvp.discord_user_id) {
        toAdd.push(roleMvp);
      }
      if (roleElite && member.weekly_fans_current >= thresholds.elite_fans) {
        toAdd.push(roleElite);
      }
      if (roleCore && member.weekly_status === 'GREEN') {
        toAdd.push(roleCore);
      }
      if (roleRisk && member.consecutive_red_weeks >= 2) {
        toAdd.push(roleRisk);
      }

      if (toAdd.length > 0) {
        await guildMember.roles.add(toAdd).catch(() => {});
      }
    } catch (err) {
      console.error(`weekClose: failed to update roles for ${member.discord_user_id}:`, err.message);
    }
  }
}

/**
 * Build the weekly results report string.
 * @param {Array} members   Pre-reset member rows
 * @param {string} weekLabel
 * @returns {string}
 */
function buildWeeklyReport(members, weekLabel) {
  const lines = [`📊 **Weekly Report — ${weekLabel}**`, ''];

  const mvp = findMVP(members);
  if (mvp && mvp.weekly_fans_current > 0) {
    lines.push(`🏆 **MVP:** ${mvp.in_game_name} — ${formatFans(mvp.weekly_fans_current)}`);
    lines.push('');
  }

  const green  = members.filter(m => m.weekly_status === 'GREEN');
  const yellow = members.filter(m => m.weekly_status === 'YELLOW');
  const red    = members.filter(m => m.weekly_status === 'RED');

  lines.push(`🟢 GREEN (${green.length}): ${green.map(m => m.in_game_name).join(', ') || '—'}`);
  lines.push(`🟡 YELLOW (${yellow.length}): ${yellow.map(m => m.in_game_name).join(', ') || '—'}`);
  lines.push(`🔴 RED (${red.length}): ${red.map(m => m.in_game_name).join(', ') || '—'}`);
  lines.push('');

  lines.push('**Full standings:**');
  members.forEach((m, i) => {
    const emoji = getStatusEmoji(m.weekly_status);
    lines.push(`\`${String(i + 1).padStart(2, ' ')}.\` ${emoji} **${m.in_game_name}** — ${formatFans(m.weekly_fans_current)}`);
  });

  return lines.join('\n');
}

/**
 * Build the officer summary string (post-reset, shows consecutive red weeks).
 * @returns {string}
 */
function buildOfficerSummary(weekLabel) {
  const summary = getRedWeekSummary();
  const lines = [`🛡️ **Officer Summary — ${weekLabel}**`, ''];

  if (summary.thirdPlusWeek.length > 0) {
    lines.push(`🚨 **3+ consecutive RED weeks (kick risk):**`);
    summary.thirdPlusWeek.forEach(m => lines.push(`  • ${m.in_game_name} (<@${m.discord_user_id}>) — ${m.consecutive_red_weeks} weeks`));
    lines.push('');
  }
  if (summary.secondWeek.length > 0) {
    lines.push(`⚠️ **2 consecutive RED weeks (final warning):**`);
    summary.secondWeek.forEach(m => lines.push(`  • ${m.in_game_name} (<@${m.discord_user_id}>)`));
    lines.push('');
  }
  if (summary.firstWeek.length > 0) {
    lines.push(`📋 **1st RED week (first warning):**`);
    summary.firstWeek.forEach(m => lines.push(`  • ${m.in_game_name} (<@${m.discord_user_id}>)`));
    lines.push('');
  }
  if (
    summary.firstWeek.length === 0 &&
    summary.secondWeek.length === 0 &&
    summary.thirdPlusWeek.length === 0
  ) {
    lines.push('✅ No members on consecutive RED streaks. Great week!');
  }

  return lines.join('\n');
}

/**
 * Build the push-channel warning message (tags at-risk members).
 * Uses post-reset consecutive_red_weeks values.
 * @returns {string|null}  null if no warnings needed
 */
function buildPushWarnings() {
  const summary = getRedWeekSummary();
  const lines = [];

  if (summary.thirdPlusWeek.length > 0) {
    const mentions = summary.thirdPlusWeek.map(m => `<@${m.discord_user_id}>`).join(' ');
    lines.push(`🚨 ${mentions} — You've had **3 or more consecutive RED weeks**. Urgent: please improve your fan count or discuss with officers.`);
  }
  if (summary.secondWeek.length > 0) {
    const mentions = summary.secondWeek.map(m => `<@${m.discord_user_id}>`).join(' ');
    lines.push(`⚠️ ${mentions} — You've had **2 consecutive RED weeks**. Final warning — please reach at least YELLOW next week.`);
  }
  if (summary.firstWeek.length > 0) {
    const mentions = summary.firstWeek.map(m => `<@${m.discord_user_id}>`).join(' ');
    lines.push(`📋 ${mentions} — You had a RED week. Please aim for YELLOW or GREEN next week!`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Full end-of-week close process:
 *  1. Snapshot current member state
 *  2. Save weekly history for all members (ensures non-submitters are recorded)
 *  3. Reset fans & update streaks
 *  4. Assign Discord roles
 *  5. Send weekly report to results channel
 *  6. Send push warnings to push channel
 *  7. Send officer summary to officer channel
 *
 * @param {import('discord.js').Client} client
 */
async function closeWeek(client) {
  const members = getAllMembers();          // pre-reset snapshot
  const weekLabel = getCurrentWeekLabel();

  // Ensure every member has a weekly history record (non-submitters get fans=0 / RED)
  const existingHistory = new Set(
    require('../database').getWeeklyHistoryByWeek(weekLabel).map(h => h.discord_user_id)
  );
  for (const m of members) {
    if (!existingHistory.has(m.discord_user_id)) {
      addWeeklyHistory(m.discord_user_id, weekLabel, m.weekly_fans_current, m.weekly_status);
    }
  }

  // Reset fans + update streak/consecutive counters
  resetWeeklyFans();

  // Read configured channel / role IDs
  const channelResults = getSetting('channel_results');
  const channelOfficer = getSetting('channel_officer');
  const channelPush    = getSetting('channel_push');
  const roleMvp        = getSetting('role_mvp');
  const roleElite      = getSetting('role_elite');
  const roleCore       = getSetting('role_core');
  const roleRisk       = getSetting('role_risk');

  // Assign roles (using pre-reset member data)
  const guildId = getSetting('guild_id') ?? client.guilds.cache.first()?.id;
  if (guildId) {
    try {
      const guild = await client.guilds.fetch(guildId);
      await assignRoles(guild, members, { roleMvp, roleElite, roleCore, roleRisk });
    } catch (err) {
      console.error('weekClose: failed to assign roles:', err.message);
    }
  }

  // Send weekly report
  const reportText = buildWeeklyReport(members, weekLabel);
  await trySend(client, channelResults, reportText);

  // Send officer summary (post-reset data for consecutive counts)
  const officerText = buildOfficerSummary(weekLabel);
  await trySend(client, channelOfficer, officerText);

  // Send push warnings (post-reset data)
  const pushText = buildPushWarnings();
  if (pushText) {
    await trySend(client, channelPush, pushText);
  }

  console.log(`weekClose: week ${weekLabel} closed successfully.`);
}

module.exports = { closeWeek };
