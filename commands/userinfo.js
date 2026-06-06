const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'userinfo',
  aliases: ['kullanıcıbilgi', 'kullanıcı', 'user'],
  description: 'Bir kullanıcı hakkında bilgi gösterir.',
  async execute(message, args, client) {
    const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
    const { user } = member;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`👤 Kullanıcı Bilgisi: ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🆔 Kullanıcı ID', value: user.id, inline: true },
        { name: '🏷️ Kullanıcı Adı', value: user.username, inline: true },
        { name: '📅 Hesap Kuruluş Tarihi', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`, inline: false },
        { name: '📥 Sunucuya Katılım Tarihi', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`, inline: false },
        { name: `🛡️ Roller (${member.roles.cache.size - 1})`, value: member.roles.cache.filter(role => role.name !== '@everyone').map(role => role.toString()).slice(0, 15).join(' ') || 'Bulunmuyor.', inline: false }
      )
      .setTimestamp();

    // If roles exceed 15, let them know there's more
    if (member.roles.cache.size - 1 > 15) {
      embed.addFields({ name: '...ve daha fazlası', value: `Toplam ${member.roles.cache.size - 1} rol bulunuyor.`, inline: false });
    }

    return message.reply({ embeds: [embed] });
  },
};
