const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAllMembers, getCurrentWeekLabel } = require('../database');
const { getStatusEmoji } = require('../utils/statusLogic');
const { formatFans } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('standings')
    .setDescription('Show the full weekly standings for all members.'),

  async execute(interaction) {
    const members = getAllMembers();

    if (members.length === 0) {
      return interaction.reply({
        content: '📭 No members registered yet.',
        ephemeral: true,
      });
    }

    const weekLabel = getCurrentWeekLabel();

    const total = members.reduce((sum, m) => sum + m.weekly_fans_current, 0);
    const avg = Math.round(total / members.length);

    const green  = members.filter(m => m.weekly_status === 'GREEN').length;
    const yellow = members.filter(m => m.weekly_status === 'YELLOW').length;
    const red    = members.filter(m => m.weekly_status === 'RED' && m.weekly_fans_current > 0).length;
    const noData = members.filter(m => m.weekly_fans_current === 0).length;

    const lines = members.map((m, i) => {
      const emoji = getStatusEmoji(m.weekly_status);
      const fans = m.weekly_fans_current > 0 ? formatFans(m.weekly_fans_current) : '0';
      return `\`${String(i + 1).padStart(2)}.\` ${emoji} **${m.in_game_name}** — ${fans}`;
    });

    const footer = [
      `Guild Total: ${formatFans(total)} | Average: ${formatFans(avg)}`,
      `🟢 ${green}  🟡 ${yellow}  🔴 ${red}  📭 ${noData}`,
    ].join('\n');

    // Split lines into chunks that fit within Discord's 1024-char embed field limit
    const chunks = [];
    let current = '';
    for (const line of lines) {
      const next = current ? `${current}\n${line}` : line;
      if (next.length > 1024) {
        chunks.push(current);
        current = line;
      } else {
        current = next;
      }
    }
    if (current) chunks.push(current);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`📊 Weekly Standings — ${weekLabel}`)
      .setFooter({ text: footer });

    for (let i = 0; i < chunks.length; i++) {
      const fieldName = i === 0 ? '🏅 Rankings' : '🏅 Rankings (continued)';
      embed.addFields({ name: fieldName, value: chunks[i], inline: false });
    }

    return interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
