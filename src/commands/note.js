const { SlashCommandBuilder } = require('discord.js');
const { getMember, addNote, getNotes } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const { formatJSTTimestamp } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('(Officers) Add or view private notes for a member.')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The member').setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('text')
        .setDescription('The note to add (omit to view existing notes)')
        .setRequired(false)
        .setMaxLength(1000)
    ),

  async execute(interaction) {
    const officer = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(officer)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const noteText = interaction.options.getString('text');

    const dbMember = getMember(targetUser.id);
    if (!dbMember) {
      return interaction.reply({
        content: `❌ <@${targetUser.id}> is not registered yet.`,
        ephemeral: true,
      });
    }

    if (noteText) {
      // Add a new note
      addNote(targetUser.id, noteText, interaction.user.id);
      return interaction.reply({
        content: `✅ Note added for **${dbMember.in_game_name}**.`,
        ephemeral: true,
      });
    }

    // View existing notes
    const notes = getNotes(targetUser.id);
    if (notes.length === 0) {
      return interaction.reply({
        content: `📝 No notes for **${dbMember.in_game_name}**.`,
        ephemeral: true,
      });
    }

    const noteLines = notes.map((n, i) => {
      const date = formatJSTTimestamp(n.created_at);
      return `**${i + 1}.** <@${n.written_by}> — ${date} JST\n> ${n.note_text}`;
    });

    return interaction.reply({
      content: [`📝 **Notes for ${dbMember.in_game_name}** (${notes.length}):`, '', ...noteLines].join('\n'),
      ephemeral: true,
    });
  },
};
