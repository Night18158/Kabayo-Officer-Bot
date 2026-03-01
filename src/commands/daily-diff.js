const { SlashCommandBuilder } = require('discord.js');
const { getSetting } = require('../database');
const { fetchCircleData, findLastDataIndex, DEFAULT_CIRCLE_ID } = require('../utils/umaImport');
const { formatFans } = require('../utils/formatters');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily-diff')
    .setDescription('Show today vs yesterday fan difference for all members.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    try {
      const circleId = getSetting('uma_circle_id') || DEFAULT_CIRCLE_ID;

      // Calculate JST date — used only for the display label (game timezone)
      const jstOffset = 9 * 60 * 60 * 1000;
      const jstNow = new Date(Date.now() + jstOffset);
      const jstDay = jstNow.getUTCDate();
      const jstMonth = jstNow.getUTCMonth() + 1;

      // uma.moe data uses Madrid/CET timezone (UTC+1) — use this for data fetching
      const UMA_OFFSET = 1 * 60 * 60 * 1000; // UTC+1 (CET)
      const umaNow = new Date(Date.now() + UMA_OFFSET);
      const fetchYear = umaNow.getUTCFullYear();
      const fetchMonth = umaNow.getUTCMonth() + 1;

      const data = await fetchCircleData(circleId, fetchYear, fetchMonth);

      // uma.moe always has YESTERDAY's data, not today's. daily_fans[0] is a start-of-month
      // baseline (same value as the previous month's next_month_start), not a real gain day.
      // Find the last index with actual data across all members; we need latestIdx >= 1
      // to have two days to compare.
      let latestIdx = -1;
      for (const m of data.members) {
        if (!m.daily_fans) continue;
        const idx = findLastDataIndex(m.daily_fans);
        if (idx > latestIdx) latestIdx = idx;
      }

      let activeData = data;
      let activeMonth = fetchMonth;

      if (latestIdx <= 0) {
        // Current month has no useful gain data — fall back to previous month
        const prevMonth = fetchMonth === 1 ? 12 : fetchMonth - 1;
        const prevYear = fetchMonth === 1 ? fetchYear - 1 : fetchYear;
        try {
          const prevData = await fetchCircleData(circleId, prevYear, prevMonth);
          let prevLatestIdx = -1;
          for (const m of prevData.members) {
            if (!m.daily_fans) continue;
            const idx = findLastDataIndex(m.daily_fans);
            if (idx > prevLatestIdx) prevLatestIdx = idx;
          }
          if (prevLatestIdx >= 1) {
            activeData = prevData;
            activeMonth = prevMonth;
            latestIdx = prevLatestIdx;
          }
        } catch (_) {
          // Previous month data unavailable
        }
      }

      const todayIdx = latestIdx;
      const yesterdayIdx = latestIdx - 1;

      // Check if any members have enough data (need at least two days for a meaningful diff)
      const hasAnyData = todayIdx >= 1;

      if (!hasAnyData) {
        await interaction.editReply({
          content: `📊 **Daily Fan Difference**\n\nNo fan data available yet. Data is usually updated once a day.`,
        });
        return;
      }

      const diffs = [];
      let guildTotalDiff = 0;

      for (const m of activeData.members) {
        if (!m.daily_fans || m.daily_fans[todayIdx] == null) continue;

        const todayVal = m.daily_fans[todayIdx] || 0;
        const yesterdayVal = m.daily_fans[yesterdayIdx] || 0;

        const diff = todayVal - yesterdayVal;
        if (diff !== 0 || todayVal > 0) {
          diffs.push({ name: m.trainer_name, diff });
          guildTotalDiff += diff;
        }
      }

      // Sort highest diff first
      diffs.sort((a, b) => b.diff - a.diff);

      // Format header: show JST date and which uma.moe day the gains are from
      const umaMonthName = MONTH_NAMES[activeMonth - 1];
      const umaDataDayLabel = `${umaMonthName} ${todayIdx + 1}`;
      const headerDate = `${MONTH_NAMES[jstMonth - 1]} ${jstDay}`;

      const lines = [`📊 **Daily Fan Difference** (${headerDate})`, `📊 Gains from ${umaDataDayLabel} (latest uma.moe data)`, ''];

      if (diffs.length === 0) {
        lines.push('No data available for comparison.');
      } else {
        diffs.forEach((entry, i) => {
          const sign = entry.diff >= 0 ? '+' : '';
          const flame = entry.diff > 1_000_000 ? ' 🔥' : '';
          lines.push(`${i + 1}. **${entry.name}** — ${sign}${formatFans(entry.diff)}${flame}`);
        });

        lines.push('');
        const totalSign = guildTotalDiff >= 0 ? '+' : '';
        lines.push(`**Guild Total Today: ${totalSign}${formatFans(guildTotalDiff)}**`);
      }

      await interaction.editReply({ content: lines.join('\n') });
    } catch (err) {
      console.error('daily-diff command failed:', err);
      await interaction.editReply({ content: `❌ Failed to fetch fan data: ${err.message}` });
    }
  },
};
