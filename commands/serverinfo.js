const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'serverinfo',
  aliases: ['sunucubilgi', 'sunucu', 'server'],
  description: 'Sunucu hakkında detaylı bilgi gösterir.',
  async execute(message, args, client) {
    const { guild } = message;

    // Fetch the owner of the guild
    const owner = await guild.fetchOwner();

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🏰 Sunucu Bilgileri: ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👑 Sunucu Sahibi', value: `${owner.user.tag} (${owner.id})`, inline: true },
        { name: '📅 Kuruluş Tarihi', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`, inline: true },
        { name: '👥 Üye Sayısı', value: `**${guild.memberCount}** üye`, inline: true },
        { name: '💬 Kanal Sayısı', value: `**${guild.channels.cache.size}** kanal`, inline: true },
        { name: '🛡️ Rol Sayısı', value: `**${guild.roles.cache.size}** rol`, inline: true },
        { name: '🔒 Doğrulama Seviyesi', value: `Seviye: ${guild.verificationLevel}`, inline: true }
      )
      .setFooter({ text: `Sunucu ID: ${guild.id}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
