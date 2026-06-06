const { Events } = require('discord.js');
const { prefix } = require('../config.json');

module.exports = {
  name: Events.MessageCreate,
  async execute(client, message) {
    // Ignore messages from other bots
    if (message.author.bot) return;

    const content = message.content;
    const lowerContent = content.toLowerCase();
    const lowerPrefix = prefix.toLowerCase();

    const guildId = message.guild?.id;
    const session = guildId ? client.dndGames?.get(guildId) : null;

    // Direct message handling in D&D channel (prefix-free)
    if (session && message.channel.id === session.channelId && !lowerContent.startsWith(lowerPrefix)) {
      const dndCommand = client.commands.get('dnd');
      if (dndCommand) {
        const trimmedText = content.trim();
        const lowerText = trimmedText.toLowerCase();

        // 1. LOBBY STATE: Join or Start Game
        if (session.state === 'lobby') {
          if (['başlat', 'baslat', 'basla', 'start', 'oyna', 'play'].includes(lowerText)) {
            try {
              await dndCommand.execute(message, ['basla_tema'], client);
            } catch (err) {
              console.error('Dnd başlat_tema hatası:', err);
            }
            return;
          }

          // Check for character name & class: "<Name> <Class>"
          const words = trimmedText.split(/\s+/);
          if (words.length >= 2) {
            const classInput = words[words.length - 1].toLowerCase();
            const classes = ['savasci', 'savaşçı', 'warrior', 'fighter', 'buyucu', 'büyücü', 'mage', 'wizard', 'hirsiz', 'hırsız', 'rogue', 'thief', 'rahip', 'cleric', 'priest'];
            if (classes.includes(classInput)) {
              const charName = words.slice(0, words.length - 1).join(' ');
              try {
                await dndCommand.execute(message, ['katil', charName, classInput], client);
              } catch (err) {
                console.error('Dnd katil hatası:', err);
              }
              return;
            }
          }
          return; // Ignore other talk in lobby
        }

        // 2. THEME STATE: Set Theme
        if (session.state === 'selecting_theme') {
          try {
            await dndCommand.execute(message, ['tema_sec', trimmedText], client);
          } catch (err) {
            console.error('Dnd tema_sec hatası:', err);
          }
          return;
        }

        // 3. PLAYING STATE: Actions, Status, End Game
        if (session.state === 'playing') {
          if (['durum', 'status'].includes(lowerText)) {
            try {
              await dndCommand.execute(message, ['durum'], client);
            } catch (err) {
              console.error('Dnd durum hatası:', err);
            }
            return;
          }

          if (['bitir', 'end'].includes(lowerText)) {
            try {
              await dndCommand.execute(message, ['bitir'], client);
            } catch (err) {
              console.error('Dnd bitir hatası:', err);
            }
            return;
          }

          if (session.pendingRoll) {
            const targetPlayer = session.players.get(session.pendingRoll.playerId);
            const warnMsg = await message.reply(`❌ Bekleyen bir zar testi var! Önce **${targetPlayer.charName}** adlı oyuncunun buton yardımıyla zar atması gerekiyor.`);
            setTimeout(async () => {
              try { await message.delete(); } catch(e) {}
              try { await warnMsg.delete(); } catch(e) {}
            }, 5000);
            return;
          }

          // Otherwise, treat the whole message as player action
          try {
            await dndCommand.execute(message, ['aksiyon', trimmedText], client);
          } catch (err) {
            console.error('Dnd aksiyon hatası:', err);
          }
          return;
        }
      }
    }

    // Standard command prefix checking
    if (!lowerContent.startsWith(lowerPrefix)) return;

    // Extract arguments and command name
    const args = content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Check if the command exists (by name or alias)
    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    if (!command) return;

    try {
      await command.execute(message, args, client);
    } catch (error) {
      console.error(`Error executing command "${commandName}":`, error);
      try {
        await message.reply({ content: '❌ Bu komutu çalıştırırken bir hata oluştu!' });
      } catch (err) {
        console.error('Failed to send error reply:', err);
      }
    }
  },
};
