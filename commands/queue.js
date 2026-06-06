const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'queue',
  description: 'Müzik sırasını görüntüler.',
  execute(message, args, client) {
    const serverQueue = client.queue.get(message.guild.id);
    if (!serverQueue || !serverQueue.songs.length) {
      return message.reply('❌ Şu anda çalma listesi boş!');
    }

    const currentSong = serverQueue.songs[0];
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎵 Müzik Çalma Listesi')
      .setDescription(`**Şimdi Çalıyor:**\n🎶 [${currentSong.title}](${currentSong.url}) [Süre: ${currentSong.duration}]\n\n**Sıradaki Şarkılar:**`)
      .setTimestamp();

    const upcomingSongs = serverQueue.songs.slice(1, 11); // Display up to 10 songs
    if (upcomingSongs.length === 0) {
      embed.setDescription(`**Şimdi Çalıyor:**\n🎶 [${currentSong.title}](${currentSong.url}) [Süre: ${currentSong.duration}]\n\n*Sırada bekleyen başka şarkı yok.*`);
    } else {
      let index = 1;
      upcomingSongs.forEach(song => {
        embed.addFields({
          name: `#${index++} - ${song.title}`,
          value: `Süre: ${song.duration} | [Bağlantı](${song.url})`,
          inline: false
        });
      });

      if (serverQueue.songs.length > 11) {
        embed.setFooter({ text: `Ve sırada bekleyen ${serverQueue.songs.length - 11} şarkı daha var...` });
      }
    }

    return message.reply({ embeds: [embed] });
  },
};
