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
              await dndCommand.execute(message, ['basla_ekonomi'], client);
            } catch (err) {
              console.error('Dnd basla_ekonomi hatası:', err);
            }
            return;
          }

          // Check for character name & class: "<Name> <Class>"
          const words = trimmedText.split(/\s+/);
          if (words.length >= 2) {
            const classInput = words[words.length - 1].toLowerCase();
            const classes = [
              'savasci', 'savaşçı', 'warrior', 'fighter', 
              'buyucu', 'büyücü', 'mage', 'wizard', 
              'hirsiz', 'hırsız', 'rogue', 'thief', 
              'rahip', 'cleric', 'priest',
              'korucu', 'ranger', 'archer', 'okcu', 'okçu',
              'paladin', 'sovalye', 'şövalye',
              'ozan', 'bard',
              'barbar', 'barbarian',
              'kesis', 'keşiş', 'monk',
              'warlock', 'karabuyucu', 'kara büyücü',
              'druid',
              'sihirbaz', 'sorcerer', 'kan büyücüsü', 'kanbuyucusu',
              'mucit', 'sanatkar', 'artificer'
            ];
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
          // If it doesn't match starting or joining, route to lobi_soru subcommand
          try {
            await dndCommand.execute(message, ['lobi_soru', trimmedText], client);
          } catch (err) {
            console.error('Dnd lobi_soru hatası:', err);
          }
          return;
        }

        // 1.5. ECONOMY STATE: Select Economy Mode
        if (session.state === 'selecting_economy') {
          if (['1', 'ortak', 'shared'].includes(lowerText)) {
            try {
              await dndCommand.execute(message, ['sec_ekonomi', 'shared'], client);
            } catch (err) {
              console.error('Dnd sec_ekonomi hatası:', err);
            }
            return;
          } else if (['2', 'bireysel', 'personal', 'individual'].includes(lowerText)) {
            try {
              await dndCommand.execute(message, ['sec_ekonomi', 'personal'], client);
            } catch (err) {
              console.error('Dnd sec_ekonomi hatası:', err);
            }
            return;
          } else {
            const warnMsg = await message.reply('❌ Lütfen sadece **1** (Ortak Cüzdan) veya **2** (Bireysel Cüzdanlar) yazarak seçim yapın.');
            setTimeout(async () => {
              try { await message.delete(); } catch(e) {}
              try { await warnMsg.delete(); } catch(e) {}
            }, 5000);
            return;
          }
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

          if (['yetenekler', 'abilities', 'yetenek', 'ability'].includes(lowerText)) {
            try {
              await dndCommand.execute(message, ['yetenekler'], client);
            } catch (err) {
              console.error('Dnd yetenekler hatası:', err);
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

          if (['dinlen kisa', 'dinlen kısa', 'kisa dinlenme', 'kısa dinlenme', 'short rest'].includes(lowerText)) {
            try {
              await dndCommand.execute(message, ['dinlen', 'kisa'], client);
            } catch (err) {
              console.error('Dnd dinlen kisa hatası:', err);
            }
            return;
          }

          if (['dinlen uzun', 'uzun dinlenme', 'long rest'].includes(lowerText)) {
            try {
              await dndCommand.execute(message, ['dinlen', 'uzun'], client);
            } catch (err) {
              console.error('Dnd dinlen uzun hatası:', err);
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

        // 4. COMBAT STATE: Enforce Turn Order
        if (session.state === 'combat') {
          if (['durum', 'status'].includes(lowerText)) {
            try {
              await dndCommand.execute(message, ['durum'], client);
            } catch (err) {
              console.error('Dnd durum hatası:', err);
            }
            return;
          }

          if (['yetenekler', 'abilities', 'yetenek', 'ability'].includes(lowerText)) {
            try {
              await dndCommand.execute(message, ['yetenekler'], client);
            } catch (err) {
              console.error('Dnd yetenekler hatası:', err);
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

          if (lowerText.startsWith('dinlen') || lowerText.includes('rest') || lowerText.includes('dinlenme')) {
            const warnMsg = await message.reply('❌ Savaşın ortasında dinlenemezsiniz! Önce savaşı bitirmeniz gerekiyor.');
            setTimeout(async () => {
              try { await message.delete(); } catch(e) {}
              try { await warnMsg.delete(); } catch(e) {}
            }, 5000);
            return;
          }

          // Check whose turn it is
          const currentTurn = session.combat.order[session.combat.turnIndex];
          if (currentTurn.type === 'enemy') {
            const warnMsg = await message.reply(`❌ Şu an sıra **${currentTurn.name}** tarafında! Canavarın hamle yapmasını bekleyin.`);
            setTimeout(async () => {
              try { await message.delete(); } catch(e) {}
              try { await warnMsg.delete(); } catch(e) {}
            }, 5000);
            return;
          }

          const activePlayer = session.players.get(currentTurn.id);
          if (currentTurn.type === 'player' && (!activePlayer || activePlayer.userId !== message.author.id)) {
            const ownerName = activePlayer ? activePlayer.username : 'başka bir oyuncu';
            const warnMsg = await message.reply(`❌ Şu an sıra sende değil! Sıra **${activePlayer ? activePlayer.charName : currentTurn.name}** [Sahibi: ${ownerName}] adlı karakterde.`);
            setTimeout(async () => {
              try { await message.delete(); } catch(e) {}
              try { await warnMsg.delete(); } catch(e) {}
            }, 5000);
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

          // Otherwise, pass it to actions
          try {
            await dndCommand.execute(message, ['aksiyon', trimmedText], client);
          } catch (err) {
            console.error('Dnd combat aksiyon hatası:', err);
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
