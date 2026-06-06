const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'clear',
  aliases: ['sil', 'purge'],
  description: 'Belirtilen miktarda mesajı kanaldan siler (1-99 arası).',
  async execute(message, args, client) {
    // Check if the user has permission to manage messages
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ Bu komutu kullanabilmek için `Mesajları Yönet` yetkisine sahip olmalısınız!');
    }

    // Check if the bot has permission to manage messages
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ Mesajları silebilmem için `Mesajları Yönet` yetkisine sahip olmam gerekiyor!');
    }

    const amount = parseInt(args[0]);

    if (isNaN(amount) || amount < 1 || amount > 99) {
      return message.reply('❌ Lütfen silinecek mesaj sayısı için 1 ile 99 arasında geçerli bir sayı girin!');
    }

    try {
      // Bulk delete the requested amount plus the user's command message
      const deletedMessages = await message.channel.bulkDelete(amount + 1, true);
      
      const successMessage = await message.channel.send(`🧹 Başarıyla **${deletedMessages.size - 1}** mesaj temizlendi!`);
      
      // Auto-delete the confirmation message after 5 seconds
      setTimeout(() => {
        successMessage.delete().catch(() => {});
      }, 5000);

    } catch (error) {
      console.error(error);
      return message.reply('❌ Mesajlar silinirken bir hata oluştu! (Not: 14 günden eski mesajlar Discord API limitleri nedeniyle toplu silinemez.)');
    }
  },
};
