module.exports = {
  name: 'skip',
  description: 'Çalınan mevcut şarkıyı atlar ve sıradakine geçer.',
  execute(message, args, client) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('❌ Şarkıyı geçebilmek için bir ses kanalında olmalısınız!');
    }

    const serverQueue = client.queue.get(message.guild.id);
    if (!serverQueue || !serverQueue.songs.length) {
      return message.reply('❌ Sıra boş, geçilecek bir şarkı bulunmuyor!');
    }

    // Clean up active yt-dlp process if running
    if (serverQueue.process) {
      try { serverQueue.process.kill(); } catch (e) {}
      serverQueue.process = null;
    }

    // Stopping the player will trigger the Idle status handler which plays the next song
    serverQueue.player.stop();
    return message.reply('⏭️ Şarkı başarıyla atlandı!');
  },
};
