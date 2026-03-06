const { SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getMember } = require('../database');
const { formatFans } = require('../utils/formatters');
const { getStatusLabel } = require('../utils/statusLogic');
const { askOllama } = require('../utils/ollama');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the offline AI assistant a question about Uma Musume or guild strategy.')
    .addStringOption(opt =>
      opt
        .setName('question')
        .setDescription('Your question for the AI assistant')
        .setRequired(true)
        .setMaxLength(500),
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question');

    await interaction.deferReply();

    // Provide the AI with the member's current stats as context (if registered)
    let memberContext = null;
    const dbMember = getMember(interaction.user.id);
    if (dbMember) {
      const status = getStatusLabel(dbMember.weekly_status);
      memberContext = [
        `[Member context for ${dbMember.in_game_name}]`,
        `Current weekly fans: ${formatFans(dbMember.weekly_fans_current)}`,
        `Status: ${status}`,
        `Target streak: ${dbMember.streak_target_weeks} week(s)`,
        `Elite streak: ${dbMember.streak_elite_weeks} week(s)`,
      ].join('\n');
    }

    try {
      const answer = await askOllama(question, memberContext);
      await interaction.editReply({
        content: `🤖 **Airi says:**\n${answer}`,
      });
    } catch (err) {
      const isConnectionError =
        err.cause?.code === 'ECONNREFUSED' ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('fetch failed');

      if (isConnectionError) {
        await interaction.editReply({
          content: [
            '❌ **Offline AI is not available.**',
            'Ollama does not appear to be running.',
            '',
            '**To enable the offline AI assistant:**',
            '1. Install Ollama from <https://ollama.com>',
            `2. Run: \`ollama pull ${config.ollama.model}\``,
            '3. Start Ollama and restart the bot',
          ].join('\n'),
        });
      } else {
        console.error('askOllama error:', err);
        await interaction.editReply({
          content: '❌ The AI assistant encountered an error. Please try again later.',
        });
      }
    }
  },
};
