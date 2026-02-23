# Kabayo Officer Bot

Discord bot for tracking weekly fan performance in an Uma Musume: Pretty Derby guild of 30 members. Maintains Top 500 stability by creating visibility, healthy social pressure, and consistency tracking.

## Tech Stack

- **Node.js 18+**
- **discord.js v14**
- **better-sqlite3** — SQLite database
- **dotenv** — environment variables
- **node-cron** — scheduled tasks (Fase 2)

## Project Structure

```
Kabayo-Officer-Bot/
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── src/
    ├── index.js          # Bot entry point
    ├── database.js       # SQLite setup + helper functions
    ├── config.js         # Environment variables + thresholds
    ├── commands/
    │   ├── register.js   # /register ign:<name>
    │   ├── submit.js     # /submit fans:<number> [user:@user]
    │   ├── status.js     # /status [user:@user]
    │   ├── leaderboard.js# /leaderboard [type] [sort] [count]
    │   └── help.js       # /help
    └── utils/
        ├── formatters.js # Number formatting helpers
        └── statusLogic.js# GREEN/YELLOW/RED status logic
```

## Setup

1. **Clone the repo and install dependencies:**

   ```bash
   npm install
   ```

2. **Create your `.env` file from the example:**

   ```bash
   cp .env.example .env
   ```

   Fill in your `DISCORD_TOKEN`, `GUILD_ID`, and `CLIENT_ID`.

3. **Start the bot:**

   ```bash
   npm start
   ```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/register ign:<name>` | Link your Discord account to your in-game name |
| `/submit fans:<number> [user:@member]` | Submit your weekly fan count |
| `/status [user:@member]` | Check the current weekly status of a member |
| `/leaderboard [type] [sort] [count]` | Display the guild fan leaderboard |
| `/help` | Show all available commands |

## Status Tiers

| Status | Threshold | Meaning |
|--------|-----------|---------|
| 🟢 GREEN | ≥ 4.8M fans | Strong Performance |
| 🟡 YELLOW | ≥ 4.2M fans | On Track |
| 🔴 RED | < 4.2M fans | Needs Attention |