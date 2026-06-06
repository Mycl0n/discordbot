const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'kick',
  aliases: ['at'],
  description: 'Bir üyeyi sunucudan atar.',
  async execute(message, args, client) {
    // Check sender permission
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ Bu komutu kullanmak için `Üyeleri At` yetkinizin olması gerekir!');
    }

    // Check bot permission
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ Üyeleri atabilmem için `Üyeleri At` yetkisine sahip olmam gerekir!');
    }

    // Identify targets
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    if (!target) {
      return message.reply('❌ Lütfen atılacak bir kullanıcı etiketleyin veya ID\'sini girin!');
    }

    // Prevent kicking yourself or bot
    if (target.id === message.author.id) {
      return message.reply('❌ Kendinizi sunucudan atamazsınız!');
    }
    if (target.id === message.client.user.id) {
      return message.reply('❌ Beni sunucudan atamazsınız!');
    }

    // Check kickability (hierarchy check)
    if (!target.kickable) {
      return message.reply('❌ Bu kullanıcıyı atamıyorum! Rol hiyerarşisinde benden üstte veya aynı seviyede olabilir.');
    }

    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi.';

    try {
      await target.kick(reason);
      return message.reply(`✅ **${target.user.tag}** sunucudan başarıyla atıldı.\n**Sebep:** ${reason}`);
    } catch (error) {
      console.error(error);
      return message.reply('❌ Kullanıcı atılırken bir hata meydana geldi!');
    }
  },
};
