const { SlashCommandBuilder } = require('discord.js');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const {
  postNewWeekMessage,
  postMidweekCheckpoint,
  postPushDayMorning,
  postPushDayEvening,
  sendFinalPushDMs,
  postDailyFanUpdate,
  sendWeekCloseWarningDMs,
  sendStreakAlertDMs,
} = require('../utils/scheduledMessages');

const NOTIFICATION_TYPES = [
  { name: 'Daily Update',      value: 'daily-update' },
  { name: 'Midweek Checkpoint', value: 'midweek' },
  { name: 'Push Day Morning',   value: 'push-morning' },
  { name: 'Push Day Evening',   value: 'push-evening' },
  { name: 'Final Push DMs',     value: 'final-push' },
  { name: 'Week Start',         value: 'week-start' },
  { name: 'Week Close Report',  value: 'week-close-report' },
  { name: 'Streak Alert',       value: 'streak-alert' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test-notification')
    .setDescription('(Officers) Immediately trigger a scheduled notification for testing.')
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Which notification to send')
        .setRequired(true)
        .addChoices(...NOTIFICATION_TYPES)
    )
    .addStringOption(opt =>
      opt.setName('date')
        .setDescription('Optional date override (YYYY-MM-DD) — reserved for future countdown simulation')
        .setRequired(false)
    ),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(member)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const type = interaction.options.getString('type');
    const client = interaction.client;

    await interaction.deferReply({ ephemeral: true });

    try {
      let result;

      switch (type) {
        case 'daily-update':
          result = await postDailyFanUpdate(client);
          break;
        case 'midweek':
          result = await postMidweekCheckpoint(client);
          break;
        case 'push-morning':
          result = await postPushDayMorning(client);
          break;
        case 'push-evening':
          result = await postPushDayEvening(client);
          break;
        case 'final-push':
          await sendFinalPushDMs(client);
          break;
        case 'week-start':
          result = await postNewWeekMessage(client);
          break;
        case 'week-close-report':
          await sendWeekCloseWarningDMs(client);
          break;
        case 'streak-alert':
          await sendStreakAlertDMs(client);
          break;
        default:
          await interaction.editReply({ content: `❌ Unknown notification type: ${type}` });
          return;
      }

      const dmTypes = ['final-push', 'week-close-report', 'streak-alert'];
      if (!dmTypes.includes(type) && result && !result.success) {
        await interaction.editReply({
          content: `❌ Notification \`${type}\` failed: ${result.reason}`,
        });
        return;
      }

      const sentTo = dmTypes.includes(type) ? 'eligible members via DM' : 'the configured channel';
      await interaction.editReply({
        content: `✅ Sent \`${type}\` notification to ${sentTo}.`,
      });
    } catch (err) {
      console.error(`test-notification [${type}] failed:`, err);
      await interaction.editReply({ content: `❌ Failed to send notification: ${err.message}` });
    }
  },
};
