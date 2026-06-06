const { GoogleGenerativeAI } = require('@google/generative-ai');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { prefix } = require('../config.json');

module.exports = {
  name: 'dnd',
  description: 'Yapay zeka zindan ejderi (D&D) Dungeon Master oyunu.',
  async execute(message, args, client) {
    if (!client.dndGames) {
      client.dndGames = new Map();
    }

    const subCommand = args[0]?.toLowerCase();

    if (!subCommand || subCommand === 'help' || subCommand === 'yardim' || subCommand === 'yardım') {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🛡️ D&D Oyun Sistemi Rehberi')
        .setDescription([
          'Yapay zeka zindan yöneticisi (Dungeon Master) ile D&D oynamak için kullanabileceğiniz komutlar aşağıdadır:',
          '',
          `🔹 \`${prefix}dnd basla\` - Yeni bir macera lobisi oluşturur.`,
          `🔹 \`${prefix}dnd katil <Karakter Adı> <Sınıf>\` - Karakterinizle lobiye katılır.`,
          `  *(Sınıflar: Savasci, Buyucu, Hirsiz, Rahip)*`,
          `🔹 \`${prefix}dnd oyna\` - Lobideki en az 2 oyuncu hazır olduğunda oyunu ve hikayeyi başlatır.`,
          `🔹 \`${prefix}dnd aksiyon <eylem>\` - Karakterinizin yapmak istediği hareketi yapay zekaya iletir.`,
          `🔹 \`${prefix}dnd durum\` - Oyuncuların Can (HP), envanter ve yetenek durumlarını listeler.`,
          `🔹 \`${prefix}dnd bitir\` - Oturumu sonlandırır ve lobi verilerini sıfırlar.`,
          '',
          '🎲 **Yetenek Zarı Testleri:**',
          'Yapay zeka bir eyleminiz karşılığında zar atmanızı istediğinde sohbette otomatik olarak **🎲 Zar At** butonu belirecektir. Butona basarak zarı atabilirsiniz.'
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: 'Dungeons & Dragons AI' });

      return message.reply({ embeds: [embed] });
    }

    const guildId = message.guild.id;
    const session = client.dndGames.get(guildId);

    // 1. DND BASLA
    if (subCommand === 'basla' || subCommand === 'start') {
      if (session) {
        return message.reply('❌ Bu sunucuda zaten aktif bir D&D lobisi veya oyunu bulunuyor!');
      }

      client.dndGames.set(guildId, {
        state: 'lobby',
        creatorId: message.author.id,
        channelId: message.channel.id,
        players: new Map(), // userId -> character
        chat: null,
        pendingRoll: null,
        textChannel: message.channel
      });

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🛡️ D&D Macera Lobisi Kuruldu!')
        .setDescription([
          'Yeni bir yapay zeka yönetimli D&D macerası başlıyor!',
          `Katılmak için aşağıdaki komutu kullanın:`,
          `\`${prefix}dnd katil <Karakter Adı> <Sınıf>\``,
          '',
          '**Seçilebilir Sınıflar & Yetenekleri:**',
          '⚔️ **Savasci** (Kuvvet +3, Dayanıklılık +2, Zeka -1)',
          '🧙 **Buyucu** (Zeka +3, Bilgelik +2, Kuvvet -1)',
          '🏹 **Hirsiz** (El Becerisi +3, Karizma +2, Dayanıklılık -1)',
          '☀️ **Rahip** (Bilgelik +3, Dayanıklılık +2, El Becerisi -1)',
          '',
          '*Oyuna başlayabilmek için en az **1 oyuncunun** katılması gerekmektedir.*',
          ` Lobiyi kuran kişi (\`${prefix}dnd oyna\`) yazarak oyunu başlatabilir.`
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: 'Dungeons & Dragons AI' });

      return message.reply({ embeds: [embed] });
    }

    // 2. DND KATIL
    if (subCommand === 'katil' || subCommand === 'join') {
      if (!session) {
        return message.reply(`❌ Aktif bir lobi bulunmamaktadır! Önce \`${prefix}dnd basla\` yazarak bir lobi kurun.`);
      }

      if (session.state !== 'lobby') {
        return message.reply('❌ Oyun zaten başladı! Yeni bir oyuna girmek için mevcut oyunun bitmesini bekleyin.');
      }

      const charName = args[1];
      const charClassInput = args[2]?.toLowerCase();

      if (!charName || !charClassInput) {
        return message.reply(`❌ Hatalı Kullanım!\nDoğru Kullanım: \`${prefix}dnd katil <Karakter Adı> <Savasci/Buyucu/Hirsiz/Rahip>\``);
      }

      if (session.players.has(message.author.id)) {
        return message.reply('❌ Zaten lobidesiniz! Sadece bir karakterle katılabilirsiniz.');
      }

      let modifiers = {};
      let maxHp = 20;
      let displayClass = '';

      if (['savasci', 'savaşçı', 'warrior', 'fighter'].includes(charClassInput)) {
        displayClass = 'Savaşçı';
        maxHp = 24;
        modifiers = { Kuvvet: 3, Dayanıklılık: 2, 'El Becerisi': 1, Zeka: -1, Bilgelik: 0, Karizma: 0 };
      } else if (['buyucu', 'büyücü', 'mage', 'wizard'].includes(charClassInput)) {
        displayClass = 'Büyücü';
        maxHp = 14;
        modifiers = { Zeka: 3, Bilgelik: 2, 'El Becerisi': 1, Kuvvet: -1, Dayanıklılık: 0, Karizma: 0 };
      } else if (['hirsiz', 'hırsız', 'rogue', 'thief'].includes(charClassInput)) {
        displayClass = 'Hırsız';
        maxHp = 16;
        modifiers = { 'El Becerisi': 3, Karizma: 2, Zeka: 1, Kuvvet: 0, Bilgelik: 0, Dayanıklılık: -1 };
      } else if (['rahip', 'cleric', 'priest'].includes(charClassInput)) {
        displayClass = 'Rahip';
        maxHp = 18;
        modifiers = { Bilgelik: 3, Dayanıklılık: 2, Karizma: 1, Zeka: 0, Kuvvet: 1, 'El Becerisi': -1 };
      } else {
        displayClass = charClassInput.charAt(0).toUpperCase() + charClassInput.slice(1);
        maxHp = 20;
        modifiers = { Kuvvet: 1, Dayanıklılık: 1, 'El Becerisi': 1, Zeka: 1, Bilgelik: 1, Karizma: 1 };
      }

      session.players.set(message.author.id, {
        userId: message.author.id,
        username: message.author.username,
        charName: charName,
        class: displayClass,
        hp: maxHp,
        maxHp: maxHp,
        modifiers: modifiers,
        inventory: ['Sağlık İksiri', 'Basit Ekipmanlar']
      });

      return message.reply(`✅ **${charName}** (${displayClass}) olarak lobiye katıldın! Lobideki toplam oyuncu sayısı: **${session.players.size}**`);
    }

    // 3. DND OYNA
    if (subCommand === 'oyna' || subCommand === 'play') {
      if (!session) {
        return message.reply('❌ Aktif bir lobi veya oyun bulunmuyor!');
      }

      if (session.state !== 'lobby') {
        return message.reply('❌ Oyun zaten başladı!');
      }

      if (session.creatorId !== message.author.id) {
        return message.reply('❌ Oyunu sadece lobiyi kuran kişi başlatabilir!');
      }

      if (session.players.size < 1) {
        return message.reply('❌ D&D oynamak için en az **1 oyuncu** katılmalıdır!');
      }

      if (!process.env.GEMINI_API_KEY) {
        return message.reply('❌ Yapay zeka servis anahtarı (**GEMINI_API_KEY**) bulunamadı! Lütfen geliştiriciye bildirin.');
      }

      await message.channel.sendTyping();

      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        const systemInstruction = [
          'Sen deneyimli bir Dungeons & Dragons 5e Dungeon Master (DM - Oyun Yöneticisi) rolündesin. Türkçe konuşuyorsun.',
          '2 veya daha fazla oyuncudan oluşan bir gruba fantastik bir macera yaşatıyorsun.',
          '',
          'Kurallar ve Talimatlar:',
          '1. Anlatımı canlı, atmosferik ama kısa tut (her cevabın kesinlikle 800 karakteri geçmemelidir).',
          '2. Oyuncuların yerine karar verme veya onların karakterlerini hareket ettirme. Sadece dünyayı ve sonuçları anlat.',
          '3. Tehlikeli veya şansa bağlı durumlarda oyuncudan yetenek zarı testi iste.',
          '4. Zar testi istemek için metnin EN SONUNA tam olarak şu formatta ekleme yap: `[Zar: Yetenek]`. Yetenek şunlardan biri olmalıdır: Kuvvet, Dayanıklılık, El Becerisi, Zeka, Bilgelik, Karizma. Yeteneği Türkçe yaz.',
          '   Örnek: `Önünüzdeki ahşap kapıyı kırmak istiyorsunuz. Kuvvet testi yapın. [Zar: Kuvvet]`',
          '5. Oyuncu zar attığında, bot sana sonucunu iletecek (örneğin: "Thorin Kuvvet zarı attı ve 17 elde etti."). Sen bu sonuca göre hikayeyi devam ettir. 10 ve üzeri başarıdır, 15 ve üzeri büyük başarıdır. 1 kritik başarısızlık, 20 kritik başarıdır.',
          '6. Grup üyelerinin can puanlarını (HP) veya durumlarını zora sokan tuzaklarda veya savaşlarda azaltabilirsin.'
        ].join('\n');

        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          systemInstruction: systemInstruction
        });

        // Format player list for AI
        const playerDetails = Array.from(session.players.values()).map((p, idx) => {
          return `${idx + 1}. Oyuncu: ${p.username} | Karakteri: ${p.charName} (Sınıfı: ${p.class}, Canı: ${p.hp}/${p.maxHp})`;
        }).join('\n');

        const chat = model.startChat({
          history: []
        });

        session.chat = chat;
        session.state = 'playing';

        const initialPrompt = [
          'Macera Başlıyor! Oyuncularımız ve karakterleri şunlar:',
          playerDetails,
          '',
          'Lütfen oyuncuları fantastik bir dünyada (örneğin karanlık bir zindan girişi, gizemli bir orman patikası veya tekinsiz bir taverna) başlat. Ortamı anlat ve ilk hamlelerini sor.'
        ].join('\n');

        const result = await chat.sendMessage(initialPrompt);
        const responseText = result.response.text();

        // Check if there is an initial roll check (unlikely but possible)
        const rollRegex = /\[Zar:\s*(Kuvvet|Dayanıklılık|El Becerisi|Zeka|Bilgelik|Karizma)\]/i;
        const match = responseText.match(rollRegex);

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🛡️ Dungeon Master')
          .setDescription(responseText.replace(rollRegex, '').trim())
          .setTimestamp();

        const components = [];
        if (match) {
          const ability = match[1];
          session.pendingRoll = {
            ability: ability,
            playerId: Array.from(session.players.keys())[0] // Default first player
          };

          const button = new ButtonBuilder()
            .setCustomId(`dnd_roll_${ability}`)
            .setLabel(`🎲 ${ability} Zarı At (1d20)`)
            .setStyle(ButtonStyle.Primary);

          components.push(new ActionRowBuilder().addComponents(button));
        }

        await message.reply({ embeds: [embed], components: components });

      } catch (error) {
        console.error('D&D Start Error:', error);
        client.dndGames.delete(guildId);
        return message.reply(`❌ Oyun başlatılırken yapay zekadan hata alındı!\n**Hata Detayı:** \`${error.message}\``);
      }
    }

    // 4. DND AKSİYON
    if (subCommand === 'aksiyon' || subCommand === 'action') {
      if (!session || session.state !== 'playing') {
        return message.reply(`❌ Şu anda aktif bir oyun oynanmıyor! Önce lobiyi kurup oyunu başlatın.`);
      }

      if (!session.players.has(message.author.id)) {
        return message.reply('❌ Siz bu oyundaki oyunculardan biri değilsiniz!');
      }

      if (session.pendingRoll) {
        const targetPlayer = session.players.get(session.pendingRoll.playerId);
        return message.reply(`❌ Bekleyen bir zar testi var! Önce **${targetPlayer.charName}** adlı oyuncunun buton yardımıyla zar atması gerekiyor.`);
      }

      const actionText = args.slice(1).join(' ');
      if (!actionText) {
        return message.reply(`❌ Lütfen karakterinizin yapacağı eylemi yazın!\nKullanım: \`${prefix}dnd aksiyon <ne yapmak istiyorsunuz?>\``);
      }

      const player = session.players.get(message.author.id);

      await message.channel.sendTyping();

      try {
        const prompt = `[Oyuncu Hamlesi] Karakter: ${player.charName} (${player.class}) | Eylem: ${actionText}`;
        const result = await session.chat.sendMessage(prompt);
        const responseText = result.response.text();

        const rollRegex = /\[Zar:\s*(Kuvvet|Dayanıklılık|El Becerisi|Zeka|Bilgelik|Karizma)\]/i;
        const match = responseText.match(rollRegex);

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🛡️ Dungeon Master')
          .setDescription(responseText.replace(rollRegex, '').trim())
          .setTimestamp();

        const components = [];
        if (match) {
          const ability = match[1];
          session.pendingRoll = {
            ability: ability,
            playerId: message.author.id
          };

          const button = new ButtonBuilder()
            .setCustomId(`dnd_roll_${ability}`)
            .setLabel(`🎲 ${ability} Zarı At (1d20)`)
            .setStyle(ButtonStyle.Primary);

          components.push(new ActionRowBuilder().addComponents(button));
        }

        await message.reply({ embeds: [embed], components: components });

      } catch (error) {
        console.error('D&D Action Error:', error);
        return message.reply(`❌ Yapay zekadan yanıt alınamadı.\n**Hata Detayı:** \`${error.message}\``);
      }
    }

    // 5. DND DURUM
    if (subCommand === 'durum' || subCommand === 'status') {
      if (!session) {
        return message.reply('❌ Aktif bir lobi veya oyun bulunmuyor!');
      }

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🛡️ D&D Grup Durumu')
        .setTimestamp();

      session.players.forEach(p => {
        const mods = Object.entries(p.modifiers).map(([k, v]) => `${k}: ${v >= 0 ? '+' : ''}${v}`).join(', ');
        embed.addFields({
          name: `👤 ${p.charName} (${p.class})`,
          value: [
            `❤️ **Can (HP):** ${p.hp}/${p.maxHp}`,
            `🎒 **Envanter:** ${p.inventory.join(', ')}`,
            `📊 **Modifikatörler:** \`${mods}\``
          ].join('\n')
        });
      });

      return message.reply({ embeds: [embed] });
    }

    // 6. DND BİTİR
    if (subCommand === 'bitir' || subCommand === 'end') {
      if (!session) {
        return message.reply('❌ Aktif bir lobi veya oyun bulunmuyor!');
      }

      client.dndGames.delete(guildId);
      return message.reply('🏁 D&D oyun oturumu sonlandırıldı ve lobi sıfırlandı. Yeni bir oyun kurabilirsiniz!');
    }
  }
};
