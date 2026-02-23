const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'kabayo.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// --- Schema ---

db.exec(`
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
`);

// Insert default settings if not already present
const defaultSettings = {
  min_fans: '4200000',
  target_fans: '4800000',
  elite_fans: '5500000',
  streak_target_threshold: '5000000',
  week_start_day: '1',
  timezone: 'Europe/Madrid',
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
 */
function upsertMember(discordUserId, inGameName) {
  const now = new Date().toISOString();
  const existing = getMember(discordUserId);
  if (existing) {
    db.prepare('UPDATE members SET in_game_name = ? WHERE discord_user_id = ?')
      .run(inGameName, discordUserId);
  } else {
    db.prepare(`
      INSERT INTO members (discord_user_id, in_game_name, created_at)
      VALUES (?, ?, ?)
    `).run(discordUserId, inGameName, now);
  }
  return getMember(discordUserId);
}

/**
 * Update a member's weekly fan submission.
 * @param {string} discordUserId
 * @param {number} fans
 * @param {string} status
 */
function submitFans(discordUserId, fans, status) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE members
    SET weekly_fans_current = ?,
        weekly_status = ?,
        last_submission_timestamp = ?
    WHERE discord_user_id = ?
  `).run(fans, status, now, discordUserId);
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

module.exports = {
  db,
  getSettings,
  getThresholds,
  getMember,
  upsertMember,
  submitFans,
  addWeeklyHistory,
  getAllMembers,
  getCurrentWeekLabel,
};
