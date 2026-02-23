# Kabayo Officer Bot — Uma Musume Circle Management Bot

A Discord bot for managing weekly fan performance tracking in an Uma Musume: Pretty Derby circle. Maintains Top 500 stability by automating fan data imports from uma.moe, generating weekly leaderboards, tracking streaks, and keeping members informed via automated DM reminders.

## Overview

- **Automated fan tracking** — imports each member's weekly fan gains directly from the uma.moe API
- **Weekly leaderboards** — ranked display of member performance with status tiers
- **Hall of Fame** — highlights top performers and streak holders
- **Streak tracking** — consecutive GREEN weeks rewarded with ⚡ ELITE status
- **Configurable thresholds** — officers can tune all fan targets with `/set-thresholds`
- **Scheduled DM reminders** — push-day and deadline reminders sent automatically
- **Backup & export** — one-command database backup and CSV export

## Features

### Fan Tracking
- Automated daily import from uma.moe API (`/auto-import`, cron)
- Manual history backfill for the last ~8 weeks (`/import-history`)
- Manual fan submission with officer override (`/submit`, `/set-fans`, `/adjust`)
- Vacation exemption and notes (`/vacation`, `/note`)

### Reporting
- Per-member weekly status (`/status`, `/me`)
- Full leaderboard with sort/filter options (`/leaderboard`)
- Circle-wide statistics (`/stats`)
- Hall of Fame top performers (`/hall-of-fame`)
- Import status overview (`/import-status`)

### Administration
- Role-based access control (Leader / Officer / Member)
- Configurable fan thresholds (`/set-thresholds`)
- Channel and role assignment (`/set-channels`, `/set-roles`, `/set-officer-roles`)
- Database backup and CSV export (`/backup`, `/export`)
- Week lifecycle management (`/week init`, `/week start`, `/week close`, `/week reset`)

## Quick Setup Guide

### Prerequisites

- **Node.js 20+**
- A Discord bot token (from the [Discord Developer Portal](https://discord.com/developers/applications))
- Your Discord server's Guild ID and the bot's Client ID
- Your uma.moe circle ID (from your circle's uma.moe URL)

### Installation

1. **Clone the repository and install dependencies:**

   ```bash
   git clone https://github.com/Night18158/Kabayo-Officer-Bot.git
   cd Kabayo-Officer-Bot
   npm install
   ```

2. **Create your `.env` file:**

   ```bash
   cp .env.example .env
   ```

   Fill in the required values:

   ```env
   DISCORD_TOKEN=your_bot_token_here
   GUILD_ID=your_guild_id_here
   CLIENT_ID=your_client_id_here
   ```

3. **Start the bot:**

   ```bash
   npm start
   ```

### First-Time Discord Setup

Run these commands once after the bot is online:

```
/set-circle circle_id:<your_uma_circle_id>
/set-roles leader:@LeaderRole officer:@OfficerRole member:@MemberRole
/set-channels report:#report-channel announce:#announce-channel
/set-thresholds green:4800000 yellow:4200000 elite:5500000
/week init
```

## Command Reference

### Everyone (any member)

| Command | Description |
|---------|-------------|
| `/me` | Show your own current weekly status and streak |
| `/status [user]` | Check the weekly status of any member |
| `/leaderboard [type] [sort] [count]` | Display the guild fan leaderboard |
| `/hall-of-fame` | Show top performers and streak holders |
| `/stats` | Display circle-wide statistics and averages |
| `/help` | Show all available commands |
| `/link-profile trainer:<name>` | Link your uma.moe trainer name to your Discord account |
| `/feedback message:<text>` | Send anonymous feedback to officers |
| `/dm-warnings [enable/disable]` | Toggle personal push-day DM reminders |
| `/register ign:<name>` | Register your in-game name |
| `/week status` | Show the current week's progress summary |

### Officers (Guild Officer + Leader)

| Command | Description |
|---------|-------------|
| `/auto-import` | Manually trigger an import from uma.moe for the current week |
| `/import-history` | Backfill weekly history from uma.moe for the last ~8 weeks |
| `/import-status` | Show which members have been auto-imported this week |
| `/set-circle circle_id:<id>` | Set the uma.moe circle ID used for imports |
| `/submit fans:<n> [user]` | Submit or override a member's fan count for this week |
| `/set-fans user:<@user> fans:<n>` | Directly set a member's recorded fan count |
| `/adjust user:<@user> delta:<n>` | Add or subtract fans from a member's current total |
| `/vacation user:<@user> [weeks]` | Mark a member as on vacation (exempt from thresholds) |
| `/note user:<@user> text:<note>` | Attach an officer note to a member's record |
| `/backup` | Send the database file as a Discord attachment |
| `/export` | Export member data as a CSV file |
| `/set-thresholds green:<n> yellow:<n> elite:<n>` | Configure fan threshold values |
| `/set-channels report:<#ch> announce:<#ch>` | Set report and announcement channels |
| `/set-roles leader:<@r> officer:<@r> member:<@r>` | Set the role mappings used for permissions |
| `/week init` | Initialize the database for a new week |
| `/week start` | Open the current week for submissions |
| `/week close` | Close the week, generate the report, and run backup |
| `/week reset` | Reset the current week's data (use with caution) |

### Leader Only

| Command | Description |
|---------|-------------|
| `/set-officer-roles` | Configure which roles grant officer-level permissions |

## Automated Schedule

All times are JST (UTC+9).

| Time (JST) | Event |
|------------|-------|
| Daily 07:00 | Auto-import fan data from uma.moe |
| Monday 02:00 | Final push DMs sent to members below threshold |
| Monday 03:55 | Week close + weekly report + automatic backup |
| Monday 04:05 | New week announcement posted |
| Thursday 12:00 | Midweek checkpoint DMs |
| Sunday 10:00 | Push day morning reminder |
| Sunday 18:00 | Push day evening reminder |

## Fan Status Tiers

> All thresholds are configurable via `/set-thresholds`.

| Status | Default Threshold | Meaning |
|--------|-------------------|---------|
| ⚡ ELITE | ≥ 5.5M weekly fans | Exceptional performance |
| 🟢 GREEN | ≥ 4.8M weekly fans | Strong performance |
| 🟡 YELLOW | ≥ 4.2M weekly fans | On track |
| 🔴 RED | < 4.2M weekly fans | Needs attention |

## Technology

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20+ |
| Discord API | discord.js v14 |
| Database | better-sqlite3 (SQLite) |
| Scheduling | node-cron |
| Fan data | uma.moe API |

## License

MIT