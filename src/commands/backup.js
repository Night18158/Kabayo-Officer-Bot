const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { db, DB_PATH, BACKUP_DIR, getCurrentWeekLabel } = require('../database');
const { isOfficer, officerOnlyMessage } = require('../utils/permissions');

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
      // Force WAL checkpoint so the .db file has all data
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch (e) {
        console.warn('WAL checkpoint warning:', e.message);
      }

      // Create a timestamped copy in backups dir
      const weekLabel = getCurrentWeekLabel();
      const backupName = `kabayo-${weekLabel}-manual.db`;
      const backupPath = path.join(BACKUP_DIR, backupName);
      fs.copyFileSync(DB_PATH, backupPath);

      // Send the backup copy (not the live DB which may be locked)
      const attachment = new AttachmentBuilder(backupPath, { name: 'kabayo.db' });

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
