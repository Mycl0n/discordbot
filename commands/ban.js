const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'ban',
  aliases: ['yasakla'],
  description: 'Bir üyeyi sunucudan yasaklar.',
  async execute(message, args, client) {
    // Check sender permission
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ Bu komutu kullanmak için `Üyeleri Yasakla` yetkinizin olması gerekir!');
    }

    // Check bot permission
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ Üyeleri yasaklayabilmem için `Üyeleri Yasakla` yetkisine sahip olmam gerekir!');
    }

    // Identify targets
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    if (!target) {
      return message.reply('❌ Lütfen yasaklanacak bir kullanıcı etiketleyin veya ID\'sini girin!');
    }

    // Prevent banning yourself or bot
    if (target.id === message.author.id) {
      return message.reply('❌ Kendinizi yasaklayamazsınız!');
    }
    if (target.id === message.client.user.id) {
      return message.reply('❌ Beni yasaklayamazsınız!');
    }

    // Check bannability (hierarchy check)
    if (!target.bannable) {
      return message.reply('❌ Bu kullanıcıyı yasaklayamıyorum! Rol hiyerarşisinde benden üstte veya aynı seviyede olabilir.');
    }

    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi.';

    try {
      await target.ban({ reason: reason });
      return message.reply(`✅ **${target.user.tag}** sunucudan başarıyla yasaklandı.\n**Sebep:** ${reason}`);
    } catch (error) {
      console.error(error);
      return message.reply('❌ Kullanıcı yasaklanırken bir hata meydana geldi!');
    }
  },
};
