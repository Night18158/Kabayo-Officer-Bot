const { PermissionFlagsBits } = require('discord.js');
const { getSetting } = require('../database');

/**
 * Check if a guild member has Leader role.
 * Falls back to ManageGuild permission if roles are not yet configured.
 * @param {import('discord.js').GuildMember} guildMember
 * @returns {boolean}
 */
function isLeader(guildMember) {
  const leaderRoleId = getSetting('role_guild_leader');
  if (!leaderRoleId) {
    return guildMember.permissions.has(PermissionFlagsBits.ManageGuild);
  }
  return guildMember.roles.cache.has(leaderRoleId);
}

/**
 * Check if a guild member has Officer OR Leader role.
 * Falls back to ManageGuild permission if roles are not yet configured.
 * @param {import('discord.js').GuildMember} guildMember
 * @returns {boolean}
 */
function isOfficer(guildMember) {
  if (isLeader(guildMember)) return true;
  const officerRoleId = getSetting('role_guild_officer');
  if (!officerRoleId) {
    return guildMember.permissions.has(PermissionFlagsBits.ManageGuild);
  }
  return guildMember.roles.cache.has(officerRoleId);
}

/**
 * Standard denial message for members who try officer commands.
 * @returns {string}
 */
function officerOnlyMessage() {
  return '❌ This command is restricted to Guild Officers and Guild Leader.';
}

/**
 * Standard denial message for non-leaders who try leader commands.
 * @returns {string}
 */
function leaderOnlyMessage() {
  return '❌ This command is restricted to the Guild Leader.';
}

module.exports = { isLeader, isOfficer, officerOnlyMessage, leaderOnlyMessage };
