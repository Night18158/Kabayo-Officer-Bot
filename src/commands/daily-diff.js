const { SlashCommandBuilder } = require('discord.js');
const { getSetting } = require('../database');
const { fetchCircleData, DEFAULT_CIRCLE_ID } = require('../utils/umaImport');
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

      // uma.moe data uses Madrid/CET timezone (UTC+1) — use this for data indices and fetching
      const UMA_OFFSET = 1 * 60 * 60 * 1000; // UTC+1 (CET)
      const umaNow = new Date(Date.now() + UMA_OFFSET);
      const fetchYear = umaNow.getUTCFullYear();
      const fetchMonth = umaNow.getUTCMonth() + 1;
      const umaDay = umaNow.getUTCDate(); // 1-indexed

      const todayIdx = umaDay - 1;   // 0-indexed
      const yesterdayIdx = todayIdx - 1;

      const data = await fetchCircleData(circleId, fetchYear, fetchMonth);

      // Month boundary: if today is day 1, fetch previous month for yesterday's value
      let prevData = null;
      if (todayIdx === 0) {
        const prevMonth = fetchMonth === 1 ? 12 : fetchMonth - 1;
        const prevYear = fetchMonth === 1 ? fetchYear - 1 : fetchYear;
        try {
          prevData = await fetchCircleData(circleId, prevYear, prevMonth);
        } catch (_) {
          // Previous month data unavailable
        }
      }

      // Check if any members have today's data
      const hasAnyData = data.members.some(m =>
        m.daily_fans && m.daily_fans[todayIdx] > 0
      );

      if (!hasAnyData) {
        await interaction.editReply({
          content: `📊 **Daily Fan Difference**\n\nNo fan data available for today (${MONTH_NAMES[jstMonth - 1]} ${jstDay}) yet. Data is usually updated once a day.`,
        });
        return;
      }

      const diffs = [];
      let guildTotalDiff = 0;

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
          // If no prev data, show a note instead
        } else {
          yesterdayVal = m.daily_fans[yesterdayIdx] || 0;
        }

        const diff = todayVal - yesterdayVal;
        if (diff !== 0 || todayVal > 0) {
          diffs.push({ name: m.trainer_name, diff });
          guildTotalDiff += diff;
        }
      }

      // Sort highest diff first
      diffs.sort((a, b) => b.diff - a.diff);

      // Format date range in header
      const monthName = MONTH_NAMES[jstMonth - 1];
      let headerDate;
      if (todayIdx === 0) {
        const prevMonth = fetchMonth === 1 ? 12 : fetchMonth - 1;
        const prevMonthName = MONTH_NAMES[prevMonth - 1];
        const prevYear = fetchMonth === 1 ? fetchYear - 1 : fetchYear;
        const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
        headerDate = `${monthName} ${jstDay} → ${prevMonthName} ${daysInPrevMonth}`;
      } else {
        headerDate = `${monthName} ${jstDay} → ${monthName} ${jstDay - 1}`;
      }

      const lines = [`📊 **Daily Fan Difference** (${headerDate})`, ''];

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

      if (todayIdx === 0 && !prevData) {
        lines.push('');
        lines.push('ℹ️ Today is the first day of the month — previous month data is unavailable for comparison.');
      }

      await interaction.editReply({ content: lines.join('\n') });
    } catch (err) {
      console.error('daily-diff command failed:', err);
      await interaction.editReply({ content: `❌ Failed to fetch fan data: ${err.message}` });
    }
  },
};
