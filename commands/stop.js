const { VoiceConnectionStatus } = require('@discordjs/voice');

module.exports = {
  name: 'stop',
  description: 'Müziği durdurur, sırayı temizler ve ses kanalından ayrılır.',
  execute(message, args, client) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('❌ Müziği durdurabilmek için bir ses kanalında olmalısınız!');
    }

    const serverQueue = client.queue.get(message.guild.id);
    if (!serverQueue) {
      return message.reply('❌ Şu anda çalan aktif bir müzik bulunmuyor!');
    }

    serverQueue.songs = []; // Clear all songs
    
    // Clean up active yt-dlp process if running
    if (serverQueue.process) {
      try { serverQueue.process.kill(); } catch (e) {}
      serverQueue.process = null;
    }

    if (serverQueue.player) {
      serverQueue.player.stop();
    }
    
    if (serverQueue.connection && serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      serverQueue.connection.destroy();
    }
    
    client.queue.delete(message.guild.id);
    return message.reply('⏹️ Müzik durduruldu, çalma sırası temizlendi ve kanaldan çıkıldı!');
  },
};
