const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'nowplaying',
  aliases: ['np'],
  description: 'Şu anda oynatılan şarkı hakkında bilgi verir.',
  execute(message, args, client) {
    const serverQueue = client.queue.get(message.guild.id);
    if (!serverQueue || !serverQueue.songs.length) {
      return message.reply('❌ Şu anda çalan aktif bir şarkı bulunmuyor!');
    }

    const currentSong = serverQueue.songs[0];
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎶 Şimdi Oynatılıyor')
      .setDescription(`[${currentSong.title}](${currentSong.url})`)
      .addFields({ name: 'Süre', value: currentSong.duration, inline: true })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
