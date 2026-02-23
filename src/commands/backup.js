const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { DB_PATH, BACKUP_DIR } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');
const { getCurrentWeekLabel } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('(Officers) Send the database file as a Discord attachment.'),

  async execute(interaction) {
    const officer = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOfficer(officer)) {
      return interaction.reply({ content: officerOnlyMessage(), ephemeral: true });
    }

    if (!fs.existsSync(DB_PATH)) {
      return interaction.reply({
        content: '❌ Database file not found.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Create a timestamped copy in backups dir
      const weekLabel = getCurrentWeekLabel();
      const backupName = `kabayo-${weekLabel}-manual.db`;
      const backupPath = path.join(BACKUP_DIR, backupName);
      fs.copyFileSync(DB_PATH, backupPath);

      const attachment = new AttachmentBuilder(DB_PATH, { name: 'kabayo.db' });

      await interaction.editReply({
        content: `✅ Database backup ready (Week: ${weekLabel})`,
        files: [attachment],
      });
    } catch (err) {
      console.error('backup command failed:', err);
      await interaction.editReply({ content: `❌ Backup failed: ${err.message}` });
    }
  },
};
