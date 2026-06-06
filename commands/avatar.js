const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'avatar',
  aliases: ['pp', 'profil'],
  description: 'Bir kullanıcının profil resmini gösterir.',
  execute(message, args, client) {
    const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
    const { user } = member;

    // Generate avatar URLs for multiple formats
    const pngUrl = user.displayAvatarURL({ extension: 'png', size: 1024 });
    const jpgUrl = user.displayAvatarURL({ extension: 'jpg', size: 1024 });
    const webpUrl = user.displayAvatarURL({ extension: 'webp', size: 1024 });
    const dynamicUrl = user.displayAvatarURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🖼️ ${user.username}#${user.discriminator || '0000'} Avatarı`)
      .setDescription(`[PNG](${pngUrl}) | [JPG](${jpgUrl}) | [WEBP](${webpUrl}) | [Dynamic](${dynamicUrl})`)
      .setImage(dynamicUrl)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
