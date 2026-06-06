const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus } = require('@discordjs/voice');
const play = require('play-dl');

module.exports = {
  name: 'play',
  description: 'YouTube veya bağlantı üzerinden müzik çalar.',
  async execute(message, args, client) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('❌ Müzik çalabilmek için bir ses kanalında olmalısınız!');
    }

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return message.reply('❌ Ses kanalına katılmak ve konuşmak için yetkim yok!');
    }

    if (!args.length) {
      return message.reply('❌ Lütfen bir şarkı adı veya YouTube bağlantısı girin!');
    }

    const query = args.join(' ');
    let songInfo = null;
    let playlistSongs = [];
    let isPlaylist = false;
    let playlistTitle = '';

    try {
      await message.channel.sendTyping();

      const validationType = play.yt_validate(query);
      console.log(`[DEBUG] Query: "${query}", Validation: "${validationType}"`);

      if (validationType === 'playlist') {
        const playlist = await play.playlist_info(query, { incomplete: true });
        const videos = await playlist.all_videos();
        if (!videos || videos.length === 0) {
          return message.reply('❌ Oynatma listesinde hiçbir şarkı bulunamadı!');
        }
        playlistTitle = playlist.title;
        playlistSongs = videos.map(video => ({
          title: video.title,
          url: video.url,
          duration: video.durationRaw || 'Bilinmiyor',
        }));
        isPlaylist = true;
      } else if (validationType === 'video') {
        const info = await play.video_info(query);
        console.log('[DEBUG] video_info details:', info?.video_details);
        songInfo = {
          title: info.video_details.title,
          url: info.video_details.url,
          duration: info.video_details.durationRaw,
        };
      } else {
        const searchResults = await play.search(query, { limit: 1 });
        if (!searchResults.length) {
          return message.reply('❌ Herhangi bir sonuç bulunamadı!');
        }
        const video = searchResults[0];
        console.log('[DEBUG] searchResults[0]:', video);
        songInfo = {
          title: video.title,
          url: video.url,
          duration: video.durationRaw,
        };
      }
      console.log('[DEBUG] songInfo object created:', isPlaylist ? playlistSongs : songInfo);
    } catch (error) {
      console.error(error);
      return message.reply('❌ Şarkı veya oynatma listesi aranırken bir hata oluştu!');
    }

    const serverQueue = client.queue.get(message.guild.id);

    if (!serverQueue) {
      const queueConstruct = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        player: null,
        playing: true,
      };

      client.queue.set(message.guild.id, queueConstruct);

      if (isPlaylist) {
        queueConstruct.songs.push(...playlistSongs);
      } else {
        queueConstruct.songs.push(songInfo);
      }

      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        queueConstruct.connection = connection;

        const player = createAudioPlayer({
          behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
          },
        });

        queueConstruct.player = player;
        connection.subscribe(player);

        // Debug state changes
        player.on('stateChange', (oldState, newState) => {
          console.log(`[DEBUG] Player state changed from ${oldState.status} to ${newState.status}`);
        });

        connection.on('stateChange', (oldState, newState) => {
          console.log(`[DEBUG] Connection state changed from ${oldState.status} to ${newState.status}`);
        });

        // Play the first song
        await playSong(message.guild, queueConstruct.songs[0], client);

        if (isPlaylist) {
          message.reply(`🎵 **${playlistTitle}** oynatma listesinden **${playlistSongs.length}** şarkı sıraya eklendi ve ilk şarkı çalınmaya başlandı!`);
        }

        // Listen for player status idle to play the next song
        player.on(AudioPlayerStatus.Idle, () => {
          const queue = client.queue.get(message.guild.id);
          if (queue) {
            // Clean up active yt-dlp process
            if (queue.process) {
              try { queue.process.kill(); } catch (e) {}
              queue.process = null;
            }
            queue.songs.shift();
            if (queue.songs.length > 0) {
              playSong(message.guild, queue.songs[0], client);
            } else {
              // Leave channel after 30 seconds of inactivity if no new songs added
              setTimeout(() => {
                const checkQueue = client.queue.get(message.guild.id);
                if (!checkQueue || checkQueue.songs.length === 0) {
                  if (queueConstruct.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                    queueConstruct.connection.destroy();
                  }
                  client.queue.delete(message.guild.id);
                  queueConstruct.textChannel.send('🎵 Müzik sırası bittiği için ses kanalından ayrıldım.');
                }
              }, 30000);
            }
          }
        });

        player.on('error', error => {
          console.error(`Audio Player Error: ${error.message}`);
          const queue = client.queue.get(message.guild.id);
          if (queue) {
            // Clean up active yt-dlp process
            if (queue.process) {
              try { queue.process.kill(); } catch (e) {}
              queue.process = null;
            }
            queue.textChannel.send('❌ Ses çalınırken bir hata oluştu, sıradaki şarkıya geçiliyor.');
            queue.songs.shift();
            if (queue.songs.length > 0) {
              playSong(message.guild, queue.songs[0], client);
            } else {
              if (queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                queue.connection.destroy();
              }
              client.queue.delete(message.guild.id);
            }
          }
        });

        // Clean up queue if connection gets destroyed
        connection.on(VoiceConnectionStatus.Destroyed, () => {
          client.queue.delete(message.guild.id);
        });

      } catch (err) {
        console.error(err);
        client.queue.delete(message.guild.id);
        return message.reply('❌ Ses kanalına bağlanırken bir hata oluştu!');
      }
    } else {
      if (isPlaylist) {
        serverQueue.songs.push(...playlistSongs);
        return message.reply(`🎵 **${playlistTitle}** oynatma listesinden **${playlistSongs.length}** şarkı sıraya eklendi!`);
      } else {
        serverQueue.songs.push(songInfo);
        return message.reply(`🎵 **${songInfo.title}** sıraya eklendi!`);
      }
    }
  },
};

async function playSong(guild, song, client) {
  const queue = client.queue.get(guild.id);
  if (!queue) return;

  // Kill old process if running
  if (queue.process) {
    try { queue.process.kill(); } catch (e) {}
    queue.process = null;
  }

  if (!song) {
    if (queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      queue.connection.destroy();
    }
    client.queue.delete(guild.id);
    return;
  }

  try {
    const { spawn } = require('child_process');
    const path = require('path');
    const ffmpeg = require('ffmpeg-static');

    // Register FFMPEG_PATH for @discordjs/voice/prism-media
    process.env.FFMPEG_PATH = ffmpeg;

    const binaryPath = path.join(__dirname, '../yt-dlp.exe');
    
    // Spawn yt-dlp to stream audio to stdout
    const ytdlp = spawn(binaryPath, [
      '-f', 'bestaudio',
      '--js-runtimes', 'node',
      '-o', '-',
      song.url
    ]);

    queue.process = ytdlp;

    ytdlp.on('error', (err) => {
      console.error('yt-dlp process error:', err);
    });

    ytdlp.stderr.on('data', (data) => {
      console.log('[yt-dlp stderr]:', data.toString().trim());
    });

    ytdlp.on('close', (code) => {
      console.log('[yt-dlp close]: Process exited with code', code);
    });

    const { StreamType } = require('@discordjs/voice');
    const resource = createAudioResource(ytdlp.stdout, {
      inputType: StreamType.Arbitrary,
    });

    queue.player.play(resource);
    queue.textChannel.send(`🎶 Şimdi oynatılıyor: **${song.title}** [Süre: ${song.duration}]`);
  } catch (error) {
    console.error('Play function error:', error);
    queue.textChannel.send('❌ Şarkı yürütülürken hata oluştu, bir sonraki şarkı deneniyor.');
    queue.songs.shift();
    await playSong(guild, queue.songs[0], client);
  }
}
