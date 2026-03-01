const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure backups directory exists
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'kabayo.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// --- Schema ---

db.exec(`
  CREATE TABLE IF NOT EXISTS import_blacklist (
    trainer_name TEXT PRIMARY KEY,
    added_by     TEXT,
    reason       TEXT,
    created_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS members (
    discord_user_id         TEXT PRIMARY KEY,
    in_game_name            TEXT NOT NULL,
    timezone                TEXT DEFAULT 'Europe/Madrid',
    weekly_fans_current     INTEGER DEFAULT 0,
    weekly_fans_previous    INTEGER DEFAULT 0,
    weekly_status           TEXT DEFAULT 'RED',
    streak_target_weeks     INTEGER DEFAULT 0,
    streak_elite_weeks      INTEGER DEFAULT 0,
    consecutive_red_weeks   INTEGER DEFAULT 0,
    warnings_count          INTEGER DEFAULT 0,
    last_submission_timestamp TEXT,
    notes                   TEXT DEFAULT '',
    created_at              TEXT
  );

  CREATE TABLE IF NOT EXISTS guild_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS weekly_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_user_id TEXT,
    week_label      TEXT,
    fans            INTEGER,
    status          TEXT,
    created_at      TEXT
  );

  CREATE TABLE IF NOT EXISTS member_notes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_user_id TEXT NOT NULL,
    note_text       TEXT NOT NULL,
    written_by      TEXT NOT NULL,
    created_at      TEXT NOT NULL
  );
`);

// Migration: add dm_warnings_enabled column if it doesn't exist
try {
  db.exec('ALTER TABLE members ADD COLUMN dm_warnings_enabled INTEGER DEFAULT 1');
} catch (_) {
  // Column already exists — safe to ignore
}

// Migration: add fan_source column if it doesn't exist
try {
  db.exec("ALTER TABLE members ADD COLUMN fan_source TEXT DEFAULT 'none'");
} catch (_) {
  // Column already exists — safe to ignore
}

// Migration: add uma_trainer_name column if it doesn't exist
try {
  db.exec('ALTER TABLE members ADD COLUMN uma_trainer_name TEXT DEFAULT NULL');
} catch (_) {
  // Column already exists — safe to ignore
}

// Migration: add vacation_until column if it doesn't exist
try {
  db.exec('ALTER TABLE members ADD COLUMN vacation_until TEXT DEFAULT NULL');
} catch (_) {
  // Column already exists — safe to ignore
}

// Migration: add vacation_reason column if it doesn't exist
try {
  db.exec('ALTER TABLE members ADD COLUMN vacation_reason TEXT DEFAULT NULL');
} catch (_) {
  // Column already exists — safe to ignore
}

// Insert default settings if not already present
const defaultSettings = {
  min_fans: '4200000',
  target_fans: '4800000',
  elite_fans: '5500000',
  streak_target_threshold: '5000000',
  week_start_day: '1',
  timezone: 'Asia/Tokyo',
};

const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO guild_settings (key, value) VALUES (?, ?)'
);

for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

// --- Helper functions ---

/**
 * Get all guild settings as an object with numeric values parsed.
 * @returns {Record<string, string>}
 */
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM guild_settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

/**
 * Get numeric thresholds from guild_settings.
 * @returns {{ min_fans: number, target_fans: number, elite_fans: number, streak_target_threshold: number }}
 */
function getThresholds() {
  const s = getSettings();
  return {
    min_fans: parseInt(s.min_fans, 10),
    target_fans: parseInt(s.target_fans, 10),
    elite_fans: parseInt(s.elite_fans, 10),
    streak_target_threshold: parseInt(s.streak_target_threshold, 10),
  };
}

/**
 * Find a member by Discord user ID.
 * @param {string} discordUserId
 */
function getMember(discordUserId) {
  return db.prepare('SELECT * FROM members WHERE discord_user_id = ?').get(discordUserId);
}

/**
 * Register or update a member's IGN.
 * @param {string} discordUserId
 * @param {string} inGameName
 * @param {boolean|null} [dmWarningsEnabled]  null = don't change (only applies on update)
 */
function upsertMember(discordUserId, inGameName, dmWarningsEnabled = null) {
  const now = new Date().toISOString();
  const existing = getMember(discordUserId);
  if (existing) {
    if (dmWarningsEnabled !== null) {
      db.prepare('UPDATE members SET in_game_name = ?, dm_warnings_enabled = ? WHERE discord_user_id = ?')
        .run(inGameName, dmWarningsEnabled ? 1 : 0, discordUserId);
    } else {
      db.prepare('UPDATE members SET in_game_name = ? WHERE discord_user_id = ?')
        .run(inGameName, discordUserId);
    }
  } else {
    const dmVal = dmWarningsEnabled === false ? 0 : 1;
    db.prepare(`
      INSERT INTO members (discord_user_id, in_game_name, created_at, dm_warnings_enabled)
      VALUES (?, ?, ?, ?)
    `).run(discordUserId, inGameName, now, dmVal);
  }
  return getMember(discordUserId);
}

/**
 * Set dm_warnings_enabled for a member.
 * @param {string} discordUserId
 * @param {boolean} enabled
 */
function setDmWarnings(discordUserId, enabled) {
  db.prepare('UPDATE members SET dm_warnings_enabled = ? WHERE discord_user_id = ?')
    .run(enabled ? 1 : 0, discordUserId);
}

/**
 * Get all members who have DM warnings enabled.
 * @returns {Array}
 */
function getMembersWithDmEnabled() {
  return db.prepare('SELECT * FROM members WHERE dm_warnings_enabled = 1').all();
}

/**
 * Update a member's weekly fan submission.
 * @param {string} discordUserId
 * @param {number} fans
 * @param {string} status
 * @param {string} [fanSource='manual']
 */
function submitFans(discordUserId, fans, status, fanSource = 'manual') {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE members
    SET weekly_fans_current = ?,
        weekly_status = ?,
        last_submission_timestamp = ?,
        fan_source = ?
    WHERE discord_user_id = ?
  `).run(fans, status, now, fanSource, discordUserId);
}

/**
 * Save a weekly history entry.
 * @param {string} discordUserId
 * @param {string} weekLabel  e.g. "2026-W09"
 * @param {number} fans
 * @param {string} status
 */
function addWeeklyHistory(discordUserId, weekLabel, fans, status) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO weekly_history (discord_user_id, week_label, fans, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(discordUserId, weekLabel, fans, status, now);
}

/**
 * Get all members ordered by current weekly fans descending.
 * @returns {Array}
 */
function getAllMembers() {
  return db.prepare('SELECT * FROM members ORDER BY weekly_fans_current DESC').all();
}

/**
 * Get the current ISO 8601 week label, e.g. "2026-W09".
 * ISO 8601: week 1 is the week containing the first Thursday of the year;
 * weeks start on Monday.
 * @returns {string}
 */
function getCurrentWeekLabel() {
  const now = new Date();
  // Shift to nearest Thursday: ISO weeks are identified by their Thursday
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // Sun=0 → 7, Mon=1..Sat=6
  const thursday = new Date(now);
  thursday.setDate(now.getDate() + (4 - dayOfWeek));
  const year = thursday.getFullYear();
  // Week 1 Monday = Jan 4 of that year minus its weekday offset
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() === 0 ? 7 : jan4.getDay();
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (jan4Day - 1));
  const weekNumber = Math.round((thursday - week1Monday) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Set a single guild setting.
 * @param {string} key
 * @param {string} value
 */
function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO guild_settings (key, value) VALUES (?, ?)').run(key, value);
}

/**
 * Get a single guild setting value.
 * @param {string} key
 * @returns {string|null}
 */
function getSetting(key) {
  const row = db.prepare('SELECT value FROM guild_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

/**
 * End-of-week reset: for each member save current → previous, update streaks,
 * update consecutive red weeks, then zero out current fans and set status to RED.
 */
function resetWeeklyFans() {
  const thresholds = getThresholds();
  db.prepare(`
    UPDATE members SET
      weekly_fans_previous    = weekly_fans_current,
      streak_target_weeks     = CASE WHEN weekly_fans_current >= ? THEN streak_target_weeks + 1 ELSE 0 END,
      streak_elite_weeks      = CASE WHEN weekly_fans_current >= ? THEN streak_elite_weeks + 1 ELSE 0 END,
      consecutive_red_weeks   = CASE WHEN weekly_status = 'RED' THEN consecutive_red_weeks + 1 ELSE 0 END,
      weekly_fans_current     = 0,
      weekly_status           = 'RED'
  `).run(thresholds.streak_target_threshold, thresholds.elite_fans);
}

/**
 * Get all members with a specific weekly status.
 * @param {'GREEN'|'YELLOW'|'RED'} status
 * @returns {Array}
 */
function getMembersByStatus(status) {
  return db.prepare('SELECT * FROM members WHERE weekly_status = ? ORDER BY weekly_fans_current DESC').all(status);
}

/**
 * Get all members who have not submitted any fans this week (current fans === 0).
 * @returns {Array}
 */
function getMembersWithNoSubmission() {
  return db.prepare('SELECT * FROM members WHERE weekly_fans_current = 0').all();
}

/**
 * Get all weekly history entries for a specific week label.
 * @param {string} weekLabel  e.g. "2026-W09"
 * @returns {Array}
 */
function getWeeklyHistoryByWeek(weekLabel) {
  return db.prepare(
    'SELECT * FROM weekly_history WHERE week_label = ? ORDER BY fans DESC'
  ).all(weekLabel);
}

/**
 * Get season totals — sum of all weekly_history fans per member, sorted descending.
 * @returns {Array<{ discord_user_id: string, in_game_name: string, total_fans: number }>}
 */
function getSeasonTotals() {
  return db.prepare(`
    SELECT m.discord_user_id, m.in_game_name, COALESCE(SUM(wh.fans), 0) AS total_fans
    FROM members m
    LEFT JOIN weekly_history wh ON m.discord_user_id = wh.discord_user_id
    GROUP BY m.discord_user_id
    ORDER BY total_fans DESC
  `).all();
}

/**
 * Get the member with the highest weekly_fans_current (the MVP).
 * Returns null if no members exist.
 * @returns {Object|null}
 */
function getMVP() {
  return db.prepare(
    'SELECT * FROM members ORDER BY weekly_fans_current DESC LIMIT 1'
  ).get() ?? null;
}

/**
 * Group members by consecutive red weeks for the officer summary.
 * Uses the CURRENT (post-reset) consecutive_red_weeks values.
 * Members on active vacation are excluded.
 * @returns {{ firstWeek: Array, secondWeek: Array, thirdPlusWeek: Array }}
 */
function getRedWeekSummary() {
  const all = db.prepare('SELECT * FROM members ORDER BY in_game_name ASC').all();
  const active = all.filter(m => !isOnVacation(m));
  return {
    firstWeek:     active.filter(m => m.consecutive_red_weeks === 1),
    secondWeek:    active.filter(m => m.consecutive_red_weeks === 2),
    thirdPlusWeek: active.filter(m => m.consecutive_red_weeks >= 3),
  };
}

/**
 * Emergency reset: zero out all fans and set status to RED without touching
 * streaks or consecutive red week counters. For testing/emergency use only.
 */
function emergencyReset() {
  db.prepare(`UPDATE members SET weekly_fans_current = 0, weekly_status = 'RED'`).run();
}

/**
 * Full leaderboard reset: back up the database, then wipe all fan-related fields
 * on every member. Does NOT delete members or touch guild_settings/member_notes.
 * @returns {{ affected: number, backupPath: string }}
 */
function fullLeaderboardReset() {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `kabayo-pre-reset-${timestamp}.db`);
  fs.copyFileSync(DB_PATH, backupPath);

  const result = db.prepare(`
    UPDATE members SET
      weekly_fans_current       = 0,
      weekly_fans_previous      = 0,
      weekly_status             = 'RED',
      streak_target_weeks       = 0,
      streak_elite_weeks        = 0,
      consecutive_red_weeks     = 0,
      last_submission_timestamp = NULL,
      fan_source                = NULL
  `).run();

  return { affected: result.changes, backupPath };
}

/**
 * Auto-register a member from uma.moe with a placeholder discord_user_id.
 * Used when a trainer_name is found in uma.moe but has no match in the bot DB.
 * @param {string} trainerName - The trainer name from uma.moe
 * @returns {Object} The newly created or existing member row
 */
function autoRegisterMember(trainerName) {
  const placeholder = `uma_${trainerName}`;
  const existing = getMember(placeholder);
  if (existing) return existing;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO members (discord_user_id, in_game_name, uma_trainer_name, created_at)
    VALUES (?, ?, ?, ?)
  `).run(placeholder, trainerName, trainerName, now);
  return getMember(placeholder);
}

/**
 * Add a private officer note for a member.
 * @param {string} discordUserId - Member's discord user ID
 * @param {string} noteText - The note content
 * @param {string} writtenBy - Officer's discord user ID
 */
function addNote(discordUserId, noteText, writtenBy) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO member_notes (discord_user_id, note_text, written_by, created_at)
    VALUES (?, ?, ?, ?)
  `).run(discordUserId, noteText, writtenBy, now);
}

/**
 * Get all notes for a member.
 * @param {string} discordUserId
 * @returns {Array}
 */
function getNotes(discordUserId) {
  return db.prepare(
    'SELECT * FROM member_notes WHERE discord_user_id = ? ORDER BY created_at DESC'
  ).all(discordUserId);
}

/**
 * Set a member's vacation period.
 * @param {string} discordUserId
 * @param {string} vacationUntil - ISO date string when vacation expires
 * @param {string} reason - Reason for vacation
 */
function setVacation(discordUserId, vacationUntil, reason) {
  db.prepare('UPDATE members SET vacation_until = ?, vacation_reason = ? WHERE discord_user_id = ?')
    .run(vacationUntil, reason, discordUserId);
}

/**
 * Remove a member's vacation (end it early).
 * @param {string} discordUserId
 */
function removeVacation(discordUserId) {
  db.prepare('UPDATE members SET vacation_until = NULL, vacation_reason = NULL WHERE discord_user_id = ?')
    .run(discordUserId);
}

/**
 * Check if a member is currently on vacation.
 * @param {Object} member - Member row from DB
 * @returns {boolean}
 */
function isOnVacation(member) {
  if (!member || !member.vacation_until) return false;
  return new Date() < new Date(member.vacation_until);
}

/**
 * Get global guild statistics from weekly_history.
 * @returns {Object}
 */
function getGuildStats() {
  const weekTotals = db.prepare(`
    SELECT week_label, SUM(fans) as total, COUNT(*) as member_count
    FROM weekly_history
    GROUP BY week_label
    ORDER BY week_label
  `).all();

  if (weekTotals.length === 0) {
    return { avgPerWeek: 0, bestWeek: null, worstWeek: null, trend: '➡️', totalWeeks: 0 };
  }

  const avgPerWeek = weekTotals.reduce((sum, w) => sum + w.total, 0) / weekTotals.length;
  const bestWeek = weekTotals.reduce((best, week) => week.total > best.total ? week : best, weekTotals[0]);
  const worstWeek = weekTotals.reduce((worst, week) => week.total < worst.total ? week : worst, weekTotals[0]);

  // Trend: compare last 4 weeks vs 4 before that
  let trend = '➡️';
  if (weekTotals.length >= 4) {
    const recent = weekTotals.slice(-4).reduce((s, w) => s + w.total, 0) / 4;
    const older  = weekTotals.slice(-8, -4);
    if (older.length > 0) {
      const olderAvg = older.reduce((s, w) => s + w.total, 0) / older.length;
      if (recent > olderAvg * 1.02) trend = '↗️';
      else if (recent < olderAvg * 0.98) trend = '↘️';
    }
  }

  return { avgPerWeek, bestWeek, worstWeek, trend, totalWeeks: weekTotals.length };
}

/**
 * Get individual member statistics from weekly_history.
 * @param {string} discordUserId
 * @returns {Object}
 */
function getMemberStats(discordUserId) {
  const history = db.prepare(`
    SELECT * FROM weekly_history WHERE discord_user_id = ? ORDER BY week_label
  `).all(discordUserId);

  if (history.length === 0) {
    return { avg: 0, bestWeek: null, greenWeeks: 0, yellowWeeks: 0, redWeeks: 0, trend: '➡️', totalWeeks: 0 };
  }

  const avg = history.reduce((sum, w) => sum + w.fans, 0) / history.length;
  const bestWeek = history.reduce((b, w) => w.fans > b.fans ? w : b, history[0]);
  const greenWeeks  = history.filter(w => w.status === 'GREEN').length;
  const yellowWeeks = history.filter(w => w.status === 'YELLOW').length;
  const redWeeks    = history.filter(w => w.status === 'RED').length;

  let trend = '➡️';
  if (history.length >= 4) {
    const recent = history.slice(-4).reduce((s, w) => s + w.fans, 0) / 4;
    const older  = history.slice(-8, -4);
    if (older.length > 0) {
      const olderAvg = older.reduce((s, w) => s + w.fans, 0) / older.length;
      if (recent > olderAvg * 1.02) trend = '↗️';
      else if (recent < olderAvg * 0.98) trend = '↘️';
    }
  }

  return { avg, bestWeek, greenWeeks, yellowWeeks, redWeeks, trend, totalWeeks: history.length, history };
}

/**
 * Get hall of fame data.
 * @returns {Object}
 */
function getHallOfFame() {
  // Most weeks as GREEN
  const mostGreen = db.prepare(`
    SELECT m.discord_user_id, m.in_game_name, COUNT(*) as green_weeks
    FROM weekly_history wh
    JOIN members m ON m.discord_user_id = wh.discord_user_id
    WHERE wh.status = 'GREEN'
    GROUP BY wh.discord_user_id
    ORDER BY green_weeks DESC
    LIMIT 1
  `).get();

  // Highest single-week fans
  const highestFans = db.prepare(`
    SELECT m.discord_user_id, m.in_game_name, wh.fans, wh.week_label
    FROM weekly_history wh
    JOIN members m ON m.discord_user_id = wh.discord_user_id
    ORDER BY wh.fans DESC
    LIMIT 1
  `).get();

  // Most MVPs (member with highest fans per week)
  const mvpCounts = db.prepare(`
    SELECT m.discord_user_id, m.in_game_name, COUNT(*) as mvp_count
    FROM weekly_history wh
    JOIN members m ON m.discord_user_id = wh.discord_user_id
    WHERE wh.fans = (
      SELECT MAX(fans) FROM weekly_history WHERE week_label = wh.week_label
    )
    AND wh.fans > 0
    GROUP BY wh.discord_user_id
    ORDER BY mvp_count DESC
    LIMIT 1
  `).get();

  // Longest target streak (use current streak_target_weeks as best available)
  const longestTargetStreak = db.prepare(`
    SELECT discord_user_id, in_game_name, streak_target_weeks
    FROM members
    ORDER BY streak_target_weeks DESC
    LIMIT 1
  `).get();

  // Longest elite streak
  const longestEliteStreak = db.prepare(`
    SELECT discord_user_id, in_game_name, streak_elite_weeks
    FROM members
    ORDER BY streak_elite_weeks DESC
    LIMIT 1
  `).get();

  return { mostGreen, highestFans, mvpCounts, longestTargetStreak, longestEliteStreak };
}

/**
 * Check whether a weekly_history entry already exists for a member + week label.
 * @param {string} discordUserId
 * @param {string} weekLabel  e.g. "2026-W05"
 * @returns {boolean}
 */
function weekHistoryExists(discordUserId, weekLabel) {
  const row = db.prepare(
    'SELECT id FROM weekly_history WHERE discord_user_id = ? AND week_label = ?'
  ).get(discordUserId, weekLabel);
  return !!row;
}

/**
 * Recalculate streak_target_weeks, streak_elite_weeks, and consecutive_red_weeks
 * for a member by scanning their weekly_history from most-recent to oldest.
 * @param {string} discordUserId
 */
function recalculateStreaksFromHistory(discordUserId) {
  const history = db.prepare(
    'SELECT fans, status FROM weekly_history WHERE discord_user_id = ? ORDER BY week_label DESC'
  ).all(discordUserId);

  const thresholds = getThresholds();
  let streakTarget = 0;
  let streakElite = 0;
  let streakRed = 0;
  let targetBroken = false;
  let eliteBroken = false;
  let redBroken = false;

  for (const week of history) {
    if (!targetBroken) {
      if (week.fans >= thresholds.streak_target_threshold) streakTarget++;
      else targetBroken = true;
    }
    if (!eliteBroken) {
      if (week.fans >= thresholds.elite_fans) streakElite++;
      else eliteBroken = true;
    }
    if (!redBroken) {
      if (week.status === 'RED') streakRed++;
      else redBroken = true;
    }
    if (targetBroken && eliteBroken && redBroken) break;
  }

  db.prepare(`
    UPDATE members
    SET streak_target_weeks   = ?,
        streak_elite_weeks    = ?,
        consecutive_red_weeks = ?
    WHERE discord_user_id = ?
  `).run(streakTarget, streakElite, streakRed, discordUserId);
}

/**
 * Get the all-time best fans for a member from weekly history.
 * @param {string} discordUserId
 * @returns {number}
 */
function getMemberAllTimeBest(discordUserId) {
  const row = db.prepare('SELECT MAX(fans) as max_fans FROM weekly_history WHERE discord_user_id = ?').get(discordUserId);
  return row ? (row.max_fans || 0) : 0;
}

/**
 * Count how many times a member has achieved GREEN in history.
 * @param {string} discordUserId
 * @returns {number}
 */
function getMemberGreenCount(discordUserId) {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM weekly_history WHERE discord_user_id = ? AND status = 'GREEN'").get(discordUserId);
  return row ? row.cnt : 0;
}

/**
 * Add a trainer name to the import blacklist.
 * @param {string} trainerName
 * @param {string} addedBy - Discord user ID of the officer who added it
 * @param {string} reason
 */
function addToBlacklist(trainerName, addedBy, reason) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO import_blacklist (trainer_name, added_by, reason, created_at)
    VALUES (?, ?, ?, ?)
  `).run(trainerName, addedBy, reason || null, now);
}

/**
 * Remove a trainer name from the import blacklist.
 * @param {string} trainerName
 * @returns {boolean} true if a row was deleted
 */
function removeFromBlacklist(trainerName) {
  const result = db.prepare(
    'DELETE FROM import_blacklist WHERE LOWER(trainer_name) = LOWER(?)'
  ).run(trainerName);
  return result.changes > 0;
}

/**
 * Check if a trainer name is on the import blacklist (case-insensitive).
 * @param {string} trainerName
 * @returns {boolean}
 */
function isBlacklisted(trainerName) {
  const row = db.prepare(
    'SELECT 1 FROM import_blacklist WHERE LOWER(trainer_name) = LOWER(?)'
  ).get(trainerName);
  return !!row;
}

/**
 * Get all entries in the import blacklist.
 * @returns {Array<{ trainer_name: string, added_by: string, reason: string, created_at: string }>}
 */
function getBlacklist() {
  return db.prepare('SELECT * FROM import_blacklist ORDER BY created_at DESC').all();
}

module.exports = {
  db,
  DB_PATH,
  BACKUP_DIR,
  getSettings,
  getThresholds,
  getMember,
  upsertMember,
  setDmWarnings,
  getMembersWithDmEnabled,
  submitFans,
  addWeeklyHistory,
  getAllMembers,
  getCurrentWeekLabel,
  setSetting,
  getSetting,
  resetWeeklyFans,
  emergencyReset,
  getMembersByStatus,
  getMembersWithNoSubmission,
  getWeeklyHistoryByWeek,
  getSeasonTotals,
  getMVP,
  getRedWeekSummary,
  autoRegisterMember,
  addNote,
  getNotes,
  setVacation,
  removeVacation,
  isOnVacation,
  getGuildStats,
  getMemberStats,
  getHallOfFame,
  getMemberAllTimeBest,
  getMemberGreenCount,
  weekHistoryExists,
  recalculateStreaksFromHistory,
  fullLeaderboardReset,
  addToBlacklist,
  removeFromBlacklist,
  isBlacklisted,
  getBlacklist,
};
