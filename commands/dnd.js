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
          `🔹 \`${prefix}dnd başlat\` - Yeni bir macera lobisi oluşturur.`,
          `🔹 \`${prefix}dnd katıl <Karakter Adı> <Sınıf>\` - Karakterinizle lobiye katılır.`,
          `  *(Sınıflar: Savasci, Buyucu, Hirsiz, Rahip)*`,
          `🔹 \`${prefix}dnd oyna\` - Lobideki en az 1 oyuncu hazır olduğunda oyunu ve hikayeyi başlatır.`,
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

    // 1. DND BAŞLAT
    if (subCommand === 'başlat' || subCommand === 'baslat' || subCommand === 'basla' || subCommand === 'start') {
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
          `\`${prefix}dnd katıl <Karakter Adı> <Sınıf>\``,
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
    if (subCommand === 'katıl' || subCommand === 'katil' || subCommand === 'join') {
      if (!session) {
        return message.reply(`❌ Aktif bir lobi bulunmamaktadır! Önce \`${prefix}dnd başlat\` yazarak bir lobi kurun.`);
      }

      if (session.state !== 'lobby') {
        return message.reply('❌ Oyun zaten başladı! Yeni bir oyuna girmek için mevcut oyunun bitmesini bekleyin.');
      }

      const charName = args[1];
      const charClassInput = args[2]?.toLowerCase();

      if (!charName || !charClassInput) {
        return message.reply(`❌ Hatalı Kullanım!\nDoğru Kullanım: \`${prefix}dnd katıl <Karakter Adı> <Savasci/Buyucu/Hirsiz/Rahip>\``);
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
          'Oyunculardan oluşan bir gruba fantastik bir macera yaşatıyorsun.',
          '',
          '🛡️ DUNGEON MASTER KURALLARI VE YÖNERGELERİ:',
          '1. ANLATIM KURALI: Canlı, sürükleyici ama kısa tasvirler yap. Her yanıtın en fazla 800 karakter olmalıdır.',
          '2. OYUNCU ÖZGÜRLÜĞÜ: Oyuncuların ne yapacağına, ne düşüneceğine veya nasıl hareket edeceğine asla sen karar verme. Karakterleri sen yönetme. Sadece ortamı ve sonuçları anlat.',
          '3. ZAR TALEP ETME KURALLARI (KRİTİK):',
          '   - Bir durum veya oda/ortam tasvir ederken, ya da yeni bir canavar/tuzak tanıtırken KESİNLİKLE zar testi isteme. Sadece "Ne yapıyorsun?" veya "Ne yapıyorsunuz?" diye sor.',
          '   - Bir zar testi yapıldıktan ve sonucunu açıkladıktan sonra, aynı mesajda KESİNLİKLE yeni bir zar testi isteme. Sonucu anlat, ortamın son durumunu belirt ve "Ne yapıyorsun?" diyerek sırayı oyuncuya devret.',
          '   - Yalnızca oyuncu "a!dnd aksiyon" komutuyla riskli, tehlikeli veya başarısızlık ihtimali olan bir eylem gerçekleştirdiğinde o eylemi çözümlemek için zar iste.',
          '   - Eğer oyuncunun eylemi basit, güvenli veya sıradan bir eylemse (Örn: etrafa bakmak, kapıyı kilitli/tuzaklı değilse açmak, güvenli bir şekilde yürümek) zar isteme, sonucu doğrudan anlat ve bir sonraki hamleyi sor.',
          '4. ZAR İSTEME FORMATI: Zar istemek için mesajın EN SONUNA tam olarak şu formatta ekleme yap: `[Zar: Yetenek]`. Yetenek şunlardan biri olmalıdır: Kuvvet, Dayanıklılık, El Becerisi, Zeka, Bilgelik, Karizma. Yeteneği Türkçe yaz.',
          '   Eğer zar istemiyorsan, mesajında kesinlikle `[Zar: Yetenek]` ifadesi yer almamalıdır.',
          '5. HİKAYE AKIŞI: Zar sonucu 10 ve üzeri başarı, 15 ve üzeri büyük başarı, 20 kritik başarı, 1 kritik başarısızlık olarak değerlendirilir. Can puanlarını (HP) duruma göre azaltabilirsin.'
        ].join('\n');

        // Format player list for AI
        const playerDetails = Array.from(session.players.values()).map((p, idx) => {
          return `${idx + 1}. Oyuncu: ${p.username} | Karakteri: ${p.charName} (Sınıfı: ${p.class}, Canı: ${p.hp}/${p.maxHp})`;
        }).join('\n');

        const initialPrompt = [
          'Macera Başlıyor! Oyuncularımız ve karakterleri şunlar:',
          playerDetails,
          '',
          'Lütfen oyuncuları fantastik bir dünyada (örneğin karanlık bir zindan girişi, gizemli bir orman patikası veya tekinsiz bir taverna) başlat. Ortamı anlat ve ilk hamlelerini sor.'
        ].join('\n');

        const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-pro-latest'];
        let chat = null;
        let responseText = '';
        let modelUsed = '';
        let lastError = null;

        for (const modelName of modelsToTry) {
          try {
            console.log(`[DEBUG] Attempting D&D start with model: ${modelName}`);
            const model = genAI.getGenerativeModel({
              model: modelName,
              systemInstruction: systemInstruction
            });
            chat = model.startChat({ history: [] });
            
            const result = await chat.sendMessage(initialPrompt);
            responseText = result.response.text();
            modelUsed = modelName;
            lastError = null;
            break; // Success! Break the loop
          } catch (err) {
            console.error(`[DEBUG] Model ${modelName} failed:`, err.message);
            lastError = err;
            chat = null;
          }
        }

        if (lastError || !chat) {
          throw new Error(lastError ? lastError.message : 'Kullanılabilir hiçbir yapay zeka modeli bulunamadı.');
        }

        session.chat = chat;
        session.modelUsed = modelUsed;
        session.state = 'playing';

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

    // 7. DND MODELLER
    if (subCommand === 'modeller' || subCommand === 'models') {
      if (!process.env.GEMINI_API_KEY) {
        return message.reply('❌ Sistemde **GEMINI_API_KEY** bulunamadı!');
      }
      try {
        await message.channel.sendTyping();
        const API_KEY = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error.message || 'Bilinmeyen API hatası.');
        }

        if (!data.models || data.models.length === 0) {
          throw new Error('Erişilebilir hiçbir model listelenemedi.');
        }

        const models = data.models.map(m => `\`${m.name.replace('models/', '')}\` (Desteklenenler: ${m.supportedGenerationMethods.map(met => met.replace('generateContent', 'İçerik Üretimi')).join(', ')})`);
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🤖 Kullanılabilir Yapay Zeka Modelleri')
          .setDescription(models.join('\n').slice(0, 4000))
          .setTimestamp();
          
        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('ListModels Error:', error);
        return message.reply(`❌ Modeller listelenirken hata oluştu!\n**Hata Detayı:** \`${error.message}\``);
      }
    }
  }
};
