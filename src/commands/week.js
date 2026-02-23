const { SlashCommandBuilder } = require('discord.js');
const { getAllMembers, emergencyReset, getCurrentWeekLabel, setSetting } = require('../database');
const { closeWeek } = require('../utils/weekClose');
const { postNewWeekMessage } = require('../utils/scheduledMessages');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const { getTimeUntilReset, getNextScheduledEvent } = require('../utils/countdown');
const { formatFans } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('week')
    .setDescription('(Officers) Week management commands.')
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Announce the start of a new week in the tracker channel.')
    )
    .addSubcommand(sub =>
      sub
        .setName('close')
        .setDescription('Close the current week: generate report, update streaks, assign roles, send warnings.')
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Reset all weekly fans to 0 without generating a report (emergency/testing).')
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('View current week overview and countdown to reset.')
    )
    .addSubcommand(sub =>
      sub
        .setName('init')
        .setDescription('Initialize the current week (first-time setup or mid-week deployment).')
        .addStringOption(opt =>
          opt
            .setName('week')
            .setDescription('Force a specific week label (e.g. "2026-W12"). Uses current ISO week if omitted.')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const members = getAllMembers();
      const weekLabel = getCurrentWeekLabel();
      const countdown = getTimeUntilReset();
      const nextEvent = getNextScheduledEvent();

      const withFans = members.filter(m => m.weekly_fans_current > 0);
      const guildAvg = withFans.length > 0
        ? Math.round(withFans.reduce((sum, m) => sum + m.weekly_fans_current, 0) / withFans.length)
        : 0;

      const green  = members.filter(m => m.weekly_status === 'GREEN').length;
      const yellow = members.filter(m => m.weekly_status === 'YELLOW').length;
      const red    = members.filter(m => m.weekly_status === 'RED' && m.weekly_fans_current > 0).length;
      const noData = members.filter(m => m.weekly_fans_current === 0).length;

      const topMember = members[0] ?? null;
      const topLine = topMember && topMember.weekly_fans_current > 0
        ? `\n🏆 **Current Top:** ${topMember.in_game_name} (${formatFans(topMember.weekly_fans_current)})`
        : '';

      const content = [
        '📅 **Week Status**',
        '',
        `**Week:** ${weekLabel}`,
        `⏳ **Time remaining:** ${countdown.formatted} until weekly reset`,
        '',
        '📊 **Guild Overview:**',
        `   Members: ${members.length} registered`,
        `   Guild Average: ${formatFans(guildAvg)}`,
        '',
        `   🟢 ${green} GREEN (target met)`,
        `   🟡 ${yellow} YELLOW (on track)`,
        `   🔴 ${red} RED (needs attention)`,
        `   📭 ${noData} no data yet`,
        topLine,
        '',
        `⏰ **Next event:** ${nextEvent.name} (~${nextEvent.formatted})`,
      ].join('\n');

      return interaction.reply({ content, ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    if (sub === 'start') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await postNewWeekMessage(interaction.client);
        await interaction.editReply({ content: '✅ New week announced in #tracker.' });
      } catch (err) {
        console.error('Error posting week start:', err);
        await interaction.editReply({ content: `❌ Failed to post week start: ${err.message}` });
      }
      return;
    }

    if (sub === 'close') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await closeWeek(interaction.client);
        await interaction.editReply({ content: '✅ Week closed. Report generated.' });
      } catch (err) {
        console.error('Error closing week:', err);
        await interaction.editReply({ content: `❌ Failed to close week: ${err.message}` });
      }
      return;
    }

    if (sub === 'reset') {
      const members = getAllMembers();
      emergencyReset();
      await interaction.reply({
        content: `✅ Week reset. All fans set to 0 (${members.length} member(s) affected).`,
        ephemeral: true,
      });
    }

    if (sub === 'init') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const forcedLabel = interaction.options.getString('week');
        const weekLabel = forcedLabel || getCurrentWeekLabel();

        // Validate forced label format
        if (forcedLabel && !/^\d{4}-W\d{2}$/.test(forcedLabel)) {
          return interaction.editReply({ content: '❌ Invalid week format. Use e.g. "2026-W12".' });
        }

        setSetting('current_week_label', weekLabel);

        const trackerChannel = require('../database').getSetting('channel_tracker');
        const { trySend } = require('../utils/scheduledMessages');
        await trySend(interaction.client, trackerChannel, [
          `📅 **Week Initialized: ${weekLabel}**`,
          '',
          'Tracking has started for this week.',
          'Fans are tracked automatically from uma.moe daily at 07:00 JST.',
        ].join('\n'));

        await interaction.editReply({ content: `✅ Week **${weekLabel}** initialized.` });
      } catch (err) {
        console.error('Error initializing week:', err);
        await interaction.editReply({ content: `❌ Failed to initialize week: ${err.message}` });
      }
    }
  },
};
