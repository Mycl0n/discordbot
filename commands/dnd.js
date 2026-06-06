const { GoogleGenerativeAI } = require('@google/generative-ai');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { prefix } = require('../config.json');

function formatCoins(totalBronze) {
  const altin = Math.floor(totalBronze / 100);
  const kalan1 = totalBronze % 100;
  const gumus = Math.floor(kalan1 / 10);
  const bronz = kalan1 % 10;

  let parts = [];
  if (altin > 0) parts.push(`🟡 ${altin} Altın`);
  if (gumus > 0) parts.push(`⚪ ${gumus} Gümüş`);
  if (bronz > 0 || parts.length === 0) parts.push(`🟤 ${bronz} Bronz`);
  
  return parts.join(' ');
}

module.exports = {
  name: 'dnd',
  formatCoins,
  description: 'Yapay zeka zindan ejderi (D&D) Dungeon Master oyunu.',
  async callOpenRouter(modelName, systemInstruction, history, prompt) {
    const messages = [
      { role: 'system', content: systemInstruction }
    ];
    if (history && history.length > 0) {
      messages.push(...history);
    }
    messages.push({ role: 'user', content: prompt });

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      throw new Error('OPENROUTER_API_KEY is not defined in environment variables.');
    }

    const modelsToTry = [
      modelName,
      'google/gemini-2.0-flash-lite:free',
      'meta-llama/llama-3-8b-instruct:free'
    ].filter(Boolean);

    let lastError = null;

    for (const model of modelsToTry) {
      try {
        console.log(`[DEBUG] Querying OpenRouter model: ${model}`);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/Mycl0n/discordbot',
            'X-Title': 'Discord D&D Bot'
          },
          body: JSON.stringify({
            model: model,
            messages: messages
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error.message || JSON.stringify(data.error));
        }

        if (!data.choices || data.choices.length === 0 || !data.choices[0].message?.content) {
          throw new Error('OpenRouter response has no content/choices.');
        }

        return {
          responseText: data.choices[0].message.content,
          modelUsed: model
        };
      } catch (err) {
        console.error(`[DEBUG] OpenRouter attempt with model ${model} failed:`, err.message);
        lastError = err;
      }
    }

    throw lastError || new Error('All OpenRouter models failed.');
  },
  async execute(message, args, client) {
    if (!message.guild) {
      return message.reply('❌ Bu komut sadece sunucularda kullanılabilir.');
    }

    if (!client.dndGames) {
      client.dndGames = new Map();
    }

    const subCommand = args[0]?.toLowerCase();
    const guildId = message.guild.id;
    const session = client.dndGames.get(guildId);

    // If there is an active session and the command is sent in a different channel, restrict access
    if (session && message.channel.id !== session.channelId) {
      if (['başlat', 'baslat', 'basla', 'start'].includes(subCommand)) {
        try { await message.delete(); } catch(e) {}
        const replyMsg = await message.channel.send(`❌ Bu sunucuda zaten aktif bir D&D macerası bulunuyor! Aktif kanal: <#${session.channelId}>`);
        setTimeout(async () => {
          try { await replyMsg.delete(); } catch(e) {}
        }, 5000);
        return;
      }
      
      // For all other commands, ignore/warn and delete original message
      try { await message.delete(); } catch(e) {}
      const replyMsg = await message.channel.send(`❌ D&D komutlarını sadece aktif D&D kanalı olan <#${session.channelId}> içinde kullanabilirsiniz!`);
      setTimeout(async () => {
        try { await replyMsg.delete(); } catch(e) {}
      }, 5000);
      return;
    }

    if (!subCommand || subCommand === 'help' || subCommand === 'yardim' || subCommand === 'yardım') {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🛡️ D&D Oyun Sistemi Rehberi')
        .setDescription([
          'Yapay zeka zindan yöneticisi (Dungeon Master) ile D&D oynamak için kullanabileceğiniz komutlar aşağıdadır:',
          '',
          `🔹 \`${prefix}dnd başlat\` - Yeni bir macera lobisi oluşturur.`,
          `🔹 \`${prefix}dnd katıl <Karakter Adı> <Sınıf>\` - Karakterinizle lobiye katılır.`,
          `  *(Sınıflar: Savasci, Buyucu, Hirsiz, Rahip, Druid, Paladin, Ozan, Barbar, Korucu, Kesis, Warlock)*`,
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

    // 1. DND BAŞLAT
    if (subCommand === 'başlat' || subCommand === 'baslat' || subCommand === 'basla' || subCommand === 'start') {
      if (session) {
        return message.reply(`❌ Bu sunucuda zaten aktif bir D&D lobisi veya oyunu bulunuyor! Aktif kanal: <#${session.channelId}>`);
      }

      let dndChannel;
      try {
        const parentCategory = message.channel.parent;
        dndChannel = await message.guild.channels.create({
          name: '🛡️-dnd-macera',
          type: ChannelType.GuildText,
          parent: parentCategory ? parentCategory.id : null,
          topic: 'Yapay Zeka Yönetimli D&D Macerası | Sonlandırmak için a!dnd bitir yazın.',
        });
      } catch (error) {
        console.error('Kanal oluşturma hatası:', error);
        return message.reply('❌ Yeni D&D kanalı oluşturulurken bir hata oluştu! Lütfen botun "Kanalları Yönet" (Manage Channels) yetkisine sahip olduğundan emin olun.');
      }

      // Delete original start message to keep chat clean
      try { await message.delete(); } catch(e) {}

      client.dndGames.set(guildId, {
        state: 'lobby',
        creatorId: message.author.id,
        channelId: dndChannel.id,
        players: new Map(), // userId -> character
        chat: null,
        pendingRoll: null,
        textChannel: dndChannel,
        client: client
      });

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🛡️ D&D Macera Lobisi Kuruldu!')
        .setDescription([
          'Yeni bir yapay zeka yönetimli D&D macerası başlıyor!',
          '',
          '🎮 **Nasıl Katılırsınız?**',
          'Bu kanala doğrudan karakter adınızı ve sınıfınızı yazın:',
          '👉 **`<Karakter Adı> <Sınıf>`** *(Örn: `Arda Hirsiz`)*',
          '',
          '**🎭 Seçilebilir Sınıflar:**',
          '⚔️ **Savasci** | 🧙 **Buyucu** | 🏹 **Hirsiz** | ☀️ **Rahip**',
          '🌿 **Druid** | 🛡️ **Paladin** | 🎵 **Ozan** | 🪓 **Barbar**',
          '🎯 **Korucu** | 🥋 **Kesis** | 😈 **Warlock**',
          '',
          '*Detaylı can, modifikatör ve ekipman/yetenek paketiniz katıldığınızda açıklanacaktır.*',
          '💡 *Başlangıç eşyalarınızın veya yeteneklerinizin ne işe yaradığını sormak için oyun başlamadan önce doğrudan buraya yazabilirsiniz!*',
          '',
          '*Oyuna başlayabilmek için en az **1 oyuncunun** katılması gerekmektedir.*',
          '🚀 Lobiyi kuran kişi bu kanala doğrudan **`başlat`** yazarak oyunu başlatabilir.'
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: 'Dungeons & Dragons AI' });

      await dndChannel.send({ embeds: [embed] });

      const infoMsg = await message.channel.send(`🛡️ D&D macerası için yeni bir kanal oluşturuldu: ${dndChannel}`);
      setTimeout(async () => {
        try { await infoMsg.delete(); } catch(e) {}
      }, 5000);

      return;
    }

    // 2. DND KATIL
    if (subCommand === 'katıl' || subCommand === 'katil' || subCommand === 'join') {
      if (!session) {
        return message.reply(`❌ Aktif bir lobi bulunmamaktadır! Önce \`${prefix}dnd başlat\` yazarak bir lobi kurun.`);
      }

      if (session.state !== 'lobby') {
        return message.reply('❌ Oyun zaten başladı! Yeni bir oyuna girmek için mevcut oyunun bitmesini bekleyin.');
      }

      let charName = '';
      let charClassInput = '';

      if (args.length > 3) {
        charClassInput = args[args.length - 1].toLowerCase();
        charName = args.slice(1, args.length - 1).join(' ');
      } else {
        charName = args[1];
        charClassInput = args[2]?.toLowerCase();
      }

      if (!charName || !charClassInput) {
        return message.reply(`❌ Hatalı Kullanım!\nDoğru Kullanım: \`${prefix}dnd katıl <Karakter Adı> <Sınıf>\``);
      }

      const playerKey = charName.toLowerCase();
      if (session.players.has(playerKey)) {
        return message.reply(`❌ **${charName}** adında bir karakter zaten lobide var! Lütfen başka bir isim seçin.`);
      }

      let modifiers = {};
      let maxHp = 20;
      let displayClass = '';
      let gold = 50;
      let inventory = [];
      let spells = [];

      if (['savasci', 'savaşçı', 'warrior', 'fighter'].includes(charClassInput)) {
        displayClass = 'Savaşçı';
        maxHp = 24;
        modifiers = { Kuvvet: 3, Dayanıklılık: 2, 'El Becerisi': 1, Zeka: -1, Bilgelik: 0, Karizma: 0 };
        gold = 50;
        inventory = ['Çelik Kılıç', 'Kalkan', 'Deri Zırh', '2x Meşale'];
        spells = ['İkinci Soluk', 'Savaş Narası'];
      } else if (['buyucu', 'büyücü', 'mage', 'wizard'].includes(charClassInput)) {
        displayClass = 'Büyücü';
        maxHp = 14;
        modifiers = { Zeka: 3, Bilgelik: 2, 'El Becerisi': 1, Kuvvet: -1, Dayanıklılık: 0, Karizma: 0 };
        gold = 80;
        inventory = ['Büyücü Asası', 'Büyü Kitabı', 'Basit Cübbe', '1x Sağlık İksiri'];
        spells = ['Alev Oku', 'Sihirli Füze', 'Kalkan'];
      } else if (['hirsiz', 'hırsız', 'rogue', 'thief'].includes(charClassInput)) {
        displayClass = 'Hırsız';
        maxHp = 16;
        modifiers = { 'El Becerisi': 3, Karizma: 2, Zeka: 1, Kuvvet: 0, Bilgelik: 0, Dayanıklılık: -1 };
        gold = 120;
        inventory = ['2x Çelik Hançer', 'Maymuncuk Seti', 'Hırsız Giysisi', 'Halat (10m)'];
        spells = ['Sinsi Saldırı', 'Kurnaz Eylem'];
      } else if (['rahip', 'cleric', 'priest'].includes(charClassInput)) {
        displayClass = 'Rahip';
        maxHp = 18;
        modifiers = { Bilgelik: 3, Dayanıklılık: 2, Karizma: 1, Zeka: 0, Kuvvet: 1, 'El Becerisi': -1 };
        gold = 60;
        inventory = ['Gümüş Topuz', 'Kutsal Sembol', 'Zırhlı Cübbe', '2x Kutsal Su'];
        spells = ['Yaraları İyileştir', 'İlahi Tarama', 'Kutsama'];
      } else if (['korucu', 'ranger', 'archer', 'okcu', 'okçu'].includes(charClassInput)) {
        displayClass = 'Korucu';
        maxHp = 18;
        modifiers = { 'El Becerisi': 3, Bilgelik: 2, Dayanıklılık: 1, Kuvvet: 0, Zeka: 0, Karizma: -1 };
        gold = 70;
        inventory = ['Uzun Yay', 'Kısa Kılıç', 'Deri Zırh', 'Ok Kını (20 Ok)'];
        spells = ['Avcının Markası', 'Keskin Göz'];
      } else if (['paladin', 'sovalye', 'şövalye'].includes(charClassInput)) {
        displayClass = 'Paladin';
        maxHp = 22;
        modifiers = { Kuvvet: 3, Karizma: 2, Dayanıklılık: 1, Bilgelik: 0, Zeka: -1, 'El Becerisi': 0 };
        gold = 60;
        inventory = ['Büyük Kılıç', 'Kutsal Sembol', 'Zincir Zırh', '1x İyileştirme İksiri'];
        spells = ['Kutsal Darbe', 'Sağaltıcı Dokunuş'];
      } else if (['ozan', 'bard'].includes(charClassInput)) {
        displayClass = 'Ozan';
        maxHp = 16;
        modifiers = { Karizma: 3, 'El Becerisi': 2, Zeka: 1, Kuvvet: -1, Bilgelik: 0, Dayanıklılık: 0 };
        gold = 90;
        inventory = ['Lut (Müzik Aleti)', 'Hançer', 'Deri Ceket', 'Diplomasi Belgesi'];
        spells = ['Ozan İlhamı', 'Kakofoni', 'Tasha Kahkahası'];
      } else if (['barbar', 'barbarian'].includes(charClassInput)) {
        displayClass = 'Barbar';
        maxHp = 28;
        modifiers = { Kuvvet: 3, Dayanıklılık: 3, 'El Becerisi': 1, Zeka: -2, Bilgelik: 0, Karizma: 0 };
        gold = 40;
        inventory = ['Çift Elli Savaş Baltası', 'Fırlatma Baltası', 'Kürk Giysiler', 'Matara'];
        spells = ['Öfke', 'Pervasız Saldırı'];
      } else if (['kesis', 'keşiş', 'monk'].includes(charClassInput)) {
        displayClass = 'Keşiş';
        maxHp = 18;
        modifiers = { 'El Becerisi': 3, Bilgelik: 2, Dayanıklılık: 1, Kuvvet: 0, Zeka: 0, Karizma: -1 };
        gold = 40;
        inventory = ['Ahşap Asa', 'Fırlatma Bıçakları', 'Basit Keşiş Cübbesi', 'Bitki Çayı'];
        spells = ['Ki Darbesi', 'Sabır Savunması'];
      } else if (['warlock', 'karabuyucu', 'kara büyücü'].includes(charClassInput)) {
        displayClass = 'Warlock';
        maxHp = 16;
        modifiers = { Karizma: 3, Dayanıklılık: 2, Zeka: 1, Kuvvet: -1, Bilgelik: 0, 'El Becerisi': 0 };
        gold = 70;
        inventory = ['Karanlık Asa', 'Kadim Kitap', 'Gölgeli Cübbe', '1x Ruh Taşı'];
        spells = ['Mistik Patlama', 'Cehennem Azabı', 'Karanlık Görüş'];
      } else if (['druid'].includes(charClassInput)) {
        displayClass = 'Druid';
        maxHp = 18;
        modifiers = { Bilgelik: 3, Dayanıklılık: 2, Zeka: 1, Kuvvet: -1, 'El Becerisi': 0, Karizma: 0 };
        gold = 50;
        inventory = ['Sarmaşık Asa', 'Şifalı Bitki Çantası', 'Deri Cübbe', 'Doğa Sembolü'];
        spells = ['Doğal Form (Kurt)', 'Diken Büyümesi', 'İyileştirici Esinti'];
      } else {
        displayClass = charClassInput.charAt(0).toUpperCase() + charClassInput.slice(1);
        maxHp = 20;
        modifiers = { Kuvvet: 1, Dayanıklılık: 1, 'El Becerisi': 1, Zeka: 1, Bilgelik: 1, Karizma: 1 };
        gold = 50;
        inventory = ['Basit Ekipmanlar'];
        spells = ['Temel Hamle'];
      }

      session.players.set(playerKey, {
        userId: message.author.id,
        username: message.author.username,
        charName: charName,
        class: displayClass,
        hp: maxHp,
        maxHp: maxHp,
        modifiers: modifiers,
        inventory: inventory,
        spells: spells,
        gold: gold,
        level: 1,
        xp: 0
      });

      const joinEmbed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('✅ Karakter Kaydedildi!')
        .setDescription([
          `**Karakter:** **${charName}** (${displayClass})`,
          `❤️ **Can (HP):** ${maxHp}/${maxHp}`,
          `💰 **Cüzdan (Sikke):** ${formatCoins(gold)}`,
          `🎒 **Ekipmanlar:** ${inventory.join(', ')}`,
          `🔮 **Yetenekler & Büyüler:** ${spells.join(', ')}`,
          '',
          `💡 *Sahip olduğunuz eşya veya yeteneklerin ne işe yaradığını öğrenmek için doğrudan buraya sorabilirsiniz! (Örn: "ilahi tarama ne işe yarar?")*`,
          '',
          `*Lobideki toplam oyuncu sayısı: **${session.players.size}***`
        ].join('\n'))
        .setTimestamp();

      return message.reply({ embeds: [joinEmbed] });
    }

    // DND BAŞLA EKONOMİ (Lobi kurucusu 'başlat' yazınca burası tetiklenir)
    if (subCommand === 'basla_ekonomi') {
      if (!session) return;
      if (session.creatorId !== message.author.id) {
        return message.reply('❌ Oyunu sadece lobiyi kuran kişi başlatabilir!');
      }
      if (session.players.size < 1) {
        return message.reply('❌ D&D oynamak için en az **1 oyuncu** katılmalıdır!');
      }

      session.state = 'selecting_economy';
      return message.reply([
        '💰 **Ekonomi Modu Seçimi**',
        'Lütfen oyun boyunca kullanılacak para yönetim biçimini seçin:',
        '1️⃣ **Ortak Cüzdan (shared)**: Tüm oyuncuların paraları tek bir havuzda birleşir, harcamalar ve kazanılan paralar bu ortak cüzdandan karşılanır.',
        '2️⃣ **Bireysel Cüzdanlar (personal)**: Her karakter kendi parasına sahip olur ve harcamaları kendisi yapar.',
        '',
        '👉 Lütfen bu kanala doğrudan **1** (veya **ortak**) ya da **2** (veya **bireysel**) yazarak seçim yapın.'
      ].join('\n'));
    }

    // DND SEÇ EKONOMİ (Ekonomi modu seçilince tetiklenir)
    if (subCommand === 'sec_ekonomi') {
      if (!session) return;
      if (session.creatorId !== message.author.id) {
        return message.reply('❌ Ekonomi modunu sadece lobiyi kuran kişi seçebilir!');
      }

      const mode = args[1]?.toLowerCase();
      if (!['shared', 'personal'].includes(mode)) {
        return message.reply('❌ Geçersiz ekonomi modu.');
      }

      session.economyMode = mode;

      if (mode === 'shared') {
        // Pool all starting gold from current players
        let totalStartingGold = 0;
        session.players.forEach(p => {
          totalStartingGold += p.gold || 0;
          p.gold = 0; // Clear individual gold since they use shared wallet
        });
        session.sharedGold = totalStartingGold;
      }

      session.state = 'selecting_theme';
      return message.reply([
        `✅ Ekonomi modu **${mode === 'shared' ? 'Ortak Cüzdan' : 'Bireysel Cüzdanlar'}** olarak seçildi!`,
        '',
        '🔮 **Tema & Evren Seçimi**',
        'Maceranın geçmesini istediğiniz temayı veya evreni bu kanala doğrudan yazın (Örn: *Ortaçağ fantastik*, *Cyberpunk*, *Kıyamet sonrası metro tünelleri* vb.).',
        'Yapay zeka zindan yöneticisi dünyayı bu temaya göre şekillendirecektir.'
      ].join('\n'));
    }

    // 3. DND OYNA / TEMA_SEC
    if (subCommand === 'oyna' || subCommand === 'play' || subCommand === 'tema_sec') {
      if (!session) {
        return message.reply('❌ Aktif bir lobi veya oyun bulunmuyor!');
      }

      if (session.state !== 'lobby' && session.state !== 'selecting_theme') {
        return message.reply('❌ Oyun zaten başladı!');
      }

      const hasCharacter = Array.from(session.players.values()).some(p => p.userId === message.author.id);
      if (session.creatorId !== message.author.id && !hasCharacter) {
        return message.reply('❌ Bu işlemi sadece oyunculardan biri gerçekleştirebilir!');
      }

      if (session.players.size < 1) {
        return message.reply('❌ D&D oynamak için en az **1 oyuncu** katılmalıdır!');
      }

      // If called via prefix without args, ask for theme first
      if (subCommand === 'oyna' && args.length === 1) {
        session.state = 'selecting_theme';
        return message.reply([
          '🔮 **Tema & Evren Seçimi**',
          `Maceranın geçmesini istediğiniz temayı veya evreni bu kanala doğrudan yazın (Örn: *Ortaçağ fantastik*, *Cyberpunk*, *Kıyamet sonrası metro tünelleri* vb.).`
        ].join('\n'));
      }

      // Get theme text
      let themeText = 'Ortaçağ Fantastik Zindanı';
      if (subCommand === 'tema_sec') {
        themeText = args.slice(1).join(' ');
      } else if (subCommand === 'oyna' && args.length > 1) {
        themeText = args.slice(1).join(' ');
      }

      if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
        return message.reply('❌ Yapay zeka servis anahtarı (**GEMINI_API_KEY** veya **OPENROUTER_API_KEY**) bulunamadı! Lütfen geliştiriciye bildirin.');
      }

      await message.channel.sendTyping();

      try {
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
          '   - Yalnızca oyuncu "a!dnd aksiyon" komutuyla veya doğrudan mesajla riskli, tehlikeli veya başarısızlık ihtimali olan bir eylem gerçekleştirdiğinde o eylemi çözümlemek için zar iste.',
          '   - Eğer oyuncunun eylemi basit, güvenli veya sıradan bir eylemse (Örn: etrafa bakmak, kapıyı kilitli/tuzaklı değilse açmak, güvenli bir şekilde yürümek) zar isteme, sonucu doğrudan anlat ve bir sonraki hamleyi sor.',
          '4. ZAR İSTEME FORMATI: Zar istemek için mesajın EN SONUNA tam olarak şu formatta ekleme yap: `[Zar: Yetenek]`. Yetenek şunlardan biri olmalıdır: Kuvvet, Dayanıklılık, El Becerisi, Zeka, Bilgelik, Karizma. Yeteneği Türkçe yaz.',
          '   Eğer zar istemiyorsan, mesajında kesinlikle `[Zar: Yetenek]` ifadesi yer almamalıdır.',
          '5. HİKAYE AKIŞI VE SAKİN BAŞLANGIÇ TEMPOSU (KRİTİK):',
          '   - Maceraya başlarken KESİNLİKLE doğrudan bir kriz, savaş, yıkım, canavar saldırısı veya tekinsiz olağanüstü bir durumla başlama.',
          '   - Oyuncuları kendi sıradan, huzurlu günlük hayatları içinde bir sahneyle başlat (Örn: evine gidip ailesiyle sakin bir akşam yemeği yemesi, köy meydanında sıradan işleriyle ilgilenmesi vb.).',
          '   - Oyuncunun karakterini tanıtmasına, çevreyle huzurlu şekilde etkileşime girmesine ve dünyayı tanımasına izin ver.',
          '   - Hikaye biraz ilerledikten, oyuncu birkaç eylem yaptıktan sonra yavaş yavaş ve doğal bir şekilde gizemleri, olayları ve tehlikeleri baş gösterdir.',
          '   - Zar sonucu 10 ve üzeri başarı, 15 ve üzeri büyük başarı, 20 kritik başarı, 1 kritik başarısızlık olarak değerlendirilir. Can puanlarını (HP) duruma göre azaltabilirsin.',
          '6. SİKKE VE PARA SİSTEMİ (KRİTİK):',
          '   - Oyundaki para birimi "sikke"dir ve Bronz, Gümüş, Altın olarak 3\'e ayrılır.',
          '   - Para değerleri: 1 Altın = 10 Gümüş, 1 Gümüş = 10 Bronz. (Dolayısıyla 1 Altın = 100 Bronz).',
          '   - Oyuncu ödeme yaptığında (örn: 1 gümüş verdiğinde), satıcı/NPC ona para üstünü bronz sikkelerle ödeyebilir. Hikaye anlatımında bunu doğal bir şekilde yansıt.',
          '   - Para değişimlerini mesajın sonuna şu formatta etiketler ekleyerek belirt: `[Sikke: +5 Altın]`, `[Sikke: -2 Gümüş]`, `[Sikke: +10 Bronz]`. Eğer birden fazla para birimi değişiyorsa ayrı ayrı ekle (Örn: `[Sikke: -1 Gümüş] [Sikke: -5 Bronz]`).'
        ].join('\n');

        // Format player list for AI
        const playerDetails = Array.from(session.players.values()).map((p, idx) => {
          return `${idx + 1}. Oyuncu: ${p.username} | Karakteri: ${p.charName} (Sınıfı: ${p.class}, Canı: ${p.hp}/${p.maxHp})`;
        }).join('\n');

        const economyDetails = session.economyMode === 'shared'
          ? `Ekonomi Modu: ORTAK CÜZDAN (Grup parası ortak bir havuzda birleşmiştir. Şu an ortak cüzdanda toplam ${formatCoins(session.sharedGold)} bulunmaktadır.)`
          : `Ekonomi Modu: BİREYSEL CÜZDANLAR (Her karakterin kendi parası vardır.)`;

        const initialPrompt = [
          `Maceranın Teması/Evreni: ${themeText}`,
          '',
          `Para Durumu:`,
          economyDetails,
          '',
          'Macera Başlıyor! Oyuncularımız ve karakterleri şunlar:',
          playerDetails,
          '',
          'Lütfen maceraya doğrudan büyük bir kriz veya tehlikeyle BAŞLAMA. Oyuncuyu, seçilen temaya uygun şekilde, kendi sıradan ve huzurlu günlük hayatı içinden sakin bir sahneyle başlat (Örn: evinde akşam yemeği yemesi, sakin bir kasaba gününde dolaşması). Ortamı ve bu sıradan anı tasvir edip ilk hamlelerini sor.',
          '',
          'NOT: Oyuncuların başlangıç sikkeleri Gümüş Sikke cinsinden cüzdanlarına eklenmiştir. Sistem para birimini 1 Altın = 10 Gümüş = 100 Bronz olarak otomatik olarak takip etmektedir. Alışverişlerde bu para birimlerini ve oranları kullan.'
        ].join('\n');

        let responseText = '';
        let modelUsed = '';

        if (process.env.OPENROUTER_API_KEY) {
          session.chatHistory = [];
          session.systemInstruction = systemInstruction;
          const configModel = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

          const result = await module.exports.callOpenRouter(configModel, systemInstruction, session.chatHistory, initialPrompt);
          responseText = result.responseText;
          modelUsed = result.modelUsed;

          session.chatHistory.push({ role: 'user', content: initialPrompt });
          session.chatHistory.push({ role: 'assistant', content: responseText });
          
          session.modelUsed = modelUsed;
          session.state = 'playing';
        } else {
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-flash-latest', 'gemini-1.5-pro', 'gemini-pro-latest'];
          let chat = null;
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
          session.systemInstruction = systemInstruction;
          session.state = 'playing';
        }

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

        await message.channel.send({ embeds: [embed], components: components });

      } catch (error) {
        console.error('D&D Start Error:', error);
        client.dndGames.delete(guildId);
        const errMsg = (error.message || String(error)).slice(0, 1500);
        return message.reply(`❌ Oyun başlatılırken yapay zekadan hata alındı!\n**Hata Detayı:** \`${errMsg}\``);
      }
    }

    // 4. DND AKSİYON
    if (subCommand === 'aksiyon' || subCommand === 'action') {
      if (!session || session.state !== 'playing') {
        return message.reply(`❌ Şu anda aktif bir oyun oynanmıyor! Önce lobiyi kurup oyunu başlatın.`);
      }

      const userChars = Array.from(session.players.values()).filter(p => p.userId === message.author.id);
      if (userChars.length === 0) {
        return message.reply('❌ Siz bu oyundaki oyunculardan biri değilsiniz!');
      }

      if (session.pendingRoll) {
        const targetPlayer = session.players.get(session.pendingRoll.playerId);
        const targetName = targetPlayer ? targetPlayer.charName : 'Bilinmeyen Karakter';
        return message.reply(`❌ Bekleyen bir zar testi var! Önce **${targetName}** adlı oyuncunun buton yardımıyla zar atması gerekiyor.`);
      }

      let actionText = args.slice(1).join(' ');
      if (!actionText) {
        return message.reply(`❌ Lütfen karakterinizin yapacağı eylemi yazın!\nKullanım: \`${prefix}dnd aksiyon <ne yapmak istiyorsunuz?>\``);
      }

      let player = null;
      let prefixMatched = false;
      const prefixMatch = actionText.match(/^([^:]+):\s*(.*)$/);
      if (prefixMatch) {
        const possibleName = prefixMatch[1].trim().toLowerCase();
        player = userChars.find(p => p.charName.toLowerCase() === possibleName);
        if (player) {
          actionText = prefixMatch[2].trim();
          prefixMatched = true;
        }
      }

      if (!player) {
        const firstWord = actionText.split(/\s+/)[0];
        const possibleNameClean = firstWord.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '').toLowerCase();
        player = userChars.find(p => p.charName.toLowerCase() === possibleNameClean);
        if (player) {
          actionText = actionText.substring(firstWord.length).trim();
          prefixMatched = true;
        }
      }

      if (!player) {
        if (session.state === 'combat') {
          const currentTurn = session.combat.order[session.combat.turnIndex];
          if (currentTurn && currentTurn.type === 'player') {
            const turnPlayer = session.players.get(currentTurn.id);
            if (turnPlayer && turnPlayer.userId === message.author.id) {
              player = turnPlayer;
            }
          }
        }

        if (!player && userChars.length === 1) {
          player = userChars[0];
        }
      }

      if (!player) {
        const charList = userChars.map(p => `**${p.charName}**`).join(', ');
        const warnMsg = await message.reply(`❌ Birden fazla karakteriniz var (${charList}). Eylemi hangi karakterin yaptığını belirtmek için mesajın başına adını ekleyin (Örn: \`${userChars[0].charName}: Kılıcımı çekiyorum\`).`);
        setTimeout(async () => {
          try { await message.delete(); } catch(e) {}
          try { await warnMsg.delete(); } catch(e) {}
        }, 7000);
        return;
      }

      await message.channel.sendTyping();

      try {
        const prompt = `[Oyuncu Hamlesi] Karakter: ${player.charName} (${player.class}) | Eylem: ${actionText}`;
        const { responseText } = await module.exports.sendMessageWithFallback(session, prompt);

        // Parse state updates (gold, HP, inventory, combat)
        const updates = module.exports.parseStateUpdates(session, responseText, player.charName.toLowerCase());

        const rollRegex = /\[Zar:\s*(Kuvvet|Dayanıklılık|El Becerisi|Zeka|Bilgelik|Karizma)(?:,\s*Zorluk:\s*(\d+))?\]/i;
        const match = updates.responseText.match(rollRegex);

        const embed = new EmbedBuilder()
          .setColor(session.state === 'combat' ? '#ED4245' : '#5865F2')
          .setTitle(session.state === 'combat' ? '⚔️ Savaş - Dungeon Master' : '🛡️ Dungeon Master')
          .setDescription(updates.responseText.replace(rollRegex, '').trim())
          .setTimestamp();

        // Print changes footer if any
        let footerParts = [];
        if (updates.hpChanges !== 0) footerParts.push(`💔 HP: ${updates.hpChanges >= 0 ? '+' : ''}${updates.hpChanges}`);
        if (updates.goldChanges !== 0) {
          const changeSign = updates.goldChanges >= 0 ? '+' : '';
          footerParts.push(`💰 Sikke: ${changeSign}${formatCoins(updates.goldChanges)}`);
        }
        if (updates.addedItems.length > 0) footerParts.push(`🎒 Alınan: ${updates.addedItems.join(', ')}`);
        if (updates.removedItems.length > 0) footerParts.push(`🗑️ Atılan: ${updates.removedItems.join(', ')}`);
        if (footerParts.length > 0) embed.setFooter({ text: footerParts.join(' | ') });

        const components = [];
        if (match) {
          const ability = match[1];
          const difficulty = match[2] ? parseInt(match[2]) : 10;
          session.pendingRoll = {
            ability: ability,
            difficulty: difficulty,
            playerId: player.charName.toLowerCase()
          };

          const button = new ButtonBuilder()
            .setCustomId(`dnd_roll_${ability}`)
            .setLabel(`🎲 ${ability} Zarı At (1d20) - DC ${difficulty}`)
            .setStyle(session.state === 'combat' ? ButtonStyle.Danger : ButtonStyle.Primary);

          components.push(new ActionRowBuilder().addComponents(button));
        }

        await message.reply({ embeds: [embed], components: components });

        // Trigger combat or advance turn order
        if (updates.combatTriggered && session.state !== 'combat') {
          module.exports.initializeCombat(session, updates.enemyText);
          const combatEmbed = module.exports.getCombatOrderEmbed(session);
          await session.textChannel.send({ embeds: [combatEmbed] });
          await module.exports.advanceTurn(session);
        } else if (session.state === 'combat') {
          if (updates.responseText.toLowerCase().includes('[savaş: bitti]') || updates.responseText.toLowerCase().includes('[savas: bitti]')) {
            session.state = 'playing';
            session.combat = null;
            await session.textChannel.send('🏆 **Savaş Bitti! Düşmanlar temizlendi.**');
          } else if (!match) {
            await module.exports.advanceTurn(session);
          }
        }

      } catch (error) {
        console.error('D&D Action Error:', error);
        const errMsg = (error.message || String(error)).slice(0, 1500);
        return message.reply(`❌ Yapay zekadan yanıt alınamadı.\n**Hata Detayı:** \`${errMsg}\``);
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

      if (session.economyMode === 'shared') {
        embed.setDescription(`💰 **Ortak Cüzdan:** ${formatCoins(session.sharedGold || 0)}`);
      }

      session.players.forEach(p => {
        const mods = Object.entries(p.modifiers).map(([k, v]) => `${k}: ${v >= 0 ? '+' : ''}${v}`).join(', ');
        const fields = [
          `❤️ **Can (HP):** ${p.hp}/${p.maxHp}`,
          `✨ **Tecrübe (XP):** ${p.xp || 0} XP`
        ];
        if (session.economyMode !== 'shared') {
          fields.push(`💰 **Cüzdan (Sikke):** ${formatCoins(p.gold || 0)}`);
        }
        fields.push(
          `🎒 **Ekipmanlar:** ${p.inventory.join(', ')}`,
          `🔮 **Yetenekler & Büyüler:** ${(p.spells || []).join(', ') || 'Yok'}`,
          `📊 **Modifikatörler:** \`${mods}\``
        );

        embed.addFields({
          name: `👤 ${p.charName} (${p.class}) - Seviye ${p.level || 1} [Sahibi: ${p.username}]`,
          value: fields.join('\n')
        });
      });

      return message.reply({ embeds: [embed] });
    }

    // 6. DND BİTİR
    if (subCommand === 'bitir' || subCommand === 'end') {
      if (!session) {
        return message.reply('❌ Aktif bir lobi veya oyun bulunmuyor!');
      }

      const gameChannel = session.textChannel;
      client.dndGames.delete(guildId);
      
      await message.reply('🏁 D&D oyun oturumu sonlandırıldı. Bu kanal 10 saniye içinde otomatik olarak silinecektir!');
      
      setTimeout(async () => {
        try {
          await gameChannel.delete('D&D oyunu bitti.');
        } catch (error) {
          console.error('Kanal silme hatası:', error);
        }
      }, 10000);

      return;
    }

    // 7. DND MODELLER
    if (subCommand === 'modeller' || subCommand === 'models') {
      if (process.env.OPENROUTER_API_KEY) {
        try {
          await message.channel.sendTyping();
          const currentModel = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🤖 OpenRouter Model Yapılandırması')
            .setDescription([
              `Aktif Model: \`${currentModel}\``,
              '',
              '💡 **Önerilen Bazı Modeller:**',
              '- `google/gemini-2.5-flash` (Hızlı, akıllı)',
              '- `google/gemini-2.0-flash-lite:free` (Ücretsiz)',
              '- `meta-llama/llama-3.3-70b-instruct:free` (Ücretsiz, çok iyi)',
              '- `deepseek/deepseek-chat` (Çok ucuz, kaliteli)',
              '',
              'Modelinizi değiştirmek için VPS sunucunuzdaki `.env` dosyasında bulunan `OPENROUTER_MODEL` değerini güncelleyebilirsiniz.'
            ].join('\n'))
            .setTimestamp();
          return message.reply({ embeds: [embed] });
        } catch (error) {
          console.error('OpenRouter Models Error:', error);
          return message.reply(`❌ Model bilgisi alınırken hata oluştu.`);
        }
      }

      if (!process.env.GEMINI_API_KEY) {
        return message.reply('❌ Sistemde **GEMINI_API_KEY** veya **OPENROUTER_API_KEY** bulunamadı!');
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
        const errMsg = (error.message || String(error)).slice(0, 1500);
        return message.reply(`❌ Modeller listelenirken hata oluştu!\n**Hata Detayı:** \`${errMsg}\``);
      }
    }

    // 8. DND LOBI SORU
    if (subCommand === 'lobi_soru') {
      if (!session) return;
        
        const question = args.slice(1).join(' ');
        if (!question) return;

        if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
          return message.reply('❌ Yapay zeka servis anahtarı bulunamadı.');
        }

        await message.channel.sendTyping();

        try {
          const lobbySystemInstruction = [
            'Sen deneyimli bir D&D Zindan Arkadaşı ve Rehberisin. Oyun henüz başlamadı, oyuncular lobide hazırlanıyor.',
            'Oyuncuların sınıflar, kurallar, başlangıç eşyaları, yetenekler veya büyüler hakkındaki sorularını yanıtla.',
            'Yanıtların kısa, öz, anlaşılır ve tamamen Türkçe olmalıdır.',
            'D&D 5e kurallarını ve sistemimizdeki 11 sınıfı (Savaşçı, Büyücü, Hırsız, Rahip, Korucu, Paladin, Ozan, Barbar, Keşiş, Warlock, Druid) temel al.',
            'Sistemimizde para birimi sikkedir ve Bronz, Gümüş, Altın olarak 3\'e ayrılır (1 Altın = 10 Gümüş, 1 Gümüş = 10 Bronz). Alışverişlerde ve para üstü ödemelerinde bu oranları temel al.',
            '',
            'SİSTEMİMİZDEKİ SINIFLAR, EŞYALAR VE YETENEKLER:',
            '1. Savaşçı: 24 HP | Ekipman: Çelik Kılıç, Kalkan, Deri Zırh, 2x Meşale, 5 Gümüş Sikke | Yetenekler: İkinci Soluk (1d10 + Seviye can yeniler), Savaş Narası (fazladan aksiyon).',
            '2. Büyücü: 14 HP | Ekipman: Büyücü Asası, Büyü Kitabı, Basit Cübbe, 1x Sağlık İksiri, 8 Gümüş Sikke | Yetenekler/Büyüler: Alev Oku (1d10 hasar), Sihirli Füze (3x 1d4+1 hasar), Kalkan (+5 Zırh Sınıfı).',
            '3. Hırsız: 16 HP | Ekipman: 2x Çelik Hançer, Maymuncuk Seti, Hırsız Giysisi, Halat (10m), 12 Gümüş Sikke | Yetenekler: Sinsi Saldırı (+2d6 hasar), Kurnaz Eylem (saklanma/kaçma).',
            '4. Rahip: 18 HP | Ekipman: Gümüş Topuz, Kutsal Sembol, Zırhlı Cübbe, 2x Kutsal Su, 6 Gümüş Sikke | Yetenekler/Büyüler: Yaraları İyileştir (1d8+Bilgelik iyileştirme), İlahi Tarama (yakındaki kutsal/tekinsiz varlıkları sezer), Kutsama (zarlara +1d4 ekler).',
            '5. Korucu: 18 HP | Ekipman: Uzun Yay, Kısa Kılıç, Deri Zırh, Ok Kını (20 Ok), 7 Gümüş Sikke | Yetenekler: Avcının Markası (hedefe fazladan hasar), Keskin Göz (dikkat ve algı testlerinde kolaylık).',
            '6. Paladin: 22 HP | Ekipman: Büyük Kılıç, Kutsal Sembol, Zincir Zırh, 1x İyileştirme İksiri, 6 Gümüş Sikke | Yetenekler: Kutsal Darbe (ekstra kutsal hasar), Sağaltıcı Dokunuş (can iyileştirme).',
            '7. Ozan: 16 HP | Ekipman: Lut (Müzik Aleti), Hançer, Deri Ceket, Diplomasi Belgesi, 9 Gümüş Sikke | Yetenekler/Büyüler: Ozan İlhamı (arkadaşına zarda bonus verir), Kakofoni (gürültülü hasar büyüsü), Tasha Kahkahası (hedefi gülme krizine sokarak saf dışı bırakır).',
            '8. Barbar: 28 HP | Ekipman: Çift Elli Savaş Baltası, Fırlatma Baltası, Kürk Giysiler, Matara, 4 Gümüş Sikke | Yetenekler: Öfke (alınan hasarı azaltır, vurulan hasarı artırır), Pervasız Saldırı (avantajlı ama riskli saldırı).',
            '9. Keşiş: 18 HP | Ekipman: Ahşap Asa, Fırlatma Bıçakları, Basit Keşiş Cübbesi, Bitki Çayı, 4 Gümüş Sikke | Yetenekler: Ki Darbesi (silahsız ekstra hızlı vuruşlar), Sabır Savunması (gelen saldırıları savuşturma).',
            '10. Warlock: 16 HP | Ekipman: Karanlık Asa, Kadim Kitap, Gölgeli Cübbe, 1x Ruh Taşı, 7 Gümüş Sikke | Yetenekler/Büyüler: Mistik Patlama (güçlü büyü atışı), Cehennem Azabı (tepki olarak alev hasarı), Karanlık Görüş (karanlıkta görme).',
            '11. Druid: 18 HP | Ekipman: Sarmaşık Asa, Şifalı Bitki Çantası, Deri Cübbe, Doğa Sembolü, 5 Gümüş Sikke | Yetenekler/Büyüler: Doğal Form (Kurt formuna dönüşür), Diken Büyümesi (alanı dikenlerle kaplar), İyileştirici Esinti (can yeniler).'
          ].join('\n');

          let responseText = '';

          if (process.env.OPENROUTER_API_KEY) {
            const configModel = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
            const result = await module.exports.callOpenRouter(configModel, lobbySystemInstruction, [], question);
            responseText = result.responseText;
          } else {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-flash-latest'];
            let lastError = null;

            for (const modelName of modelsToTry) {
              try {
                const model = genAI.getGenerativeModel({
                  model: modelName,
                  systemInstruction: lobbySystemInstruction
                });
                const result = await model.generateContent(question);
                responseText = result.response.text();
                lastError = null;
                break;
              } catch (err) {
                console.error(`[Lobby Q] Model ${modelName} failed:`, err.message);
                lastError = err;
              }
            }

            if (lastError || !responseText) {
              throw new Error(lastError ? lastError.message : 'Yapay zeka yanıt üretemedi.');
            }
          }

          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📖 Lobi Rehberi')
            .setDescription(responseText.trim())
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        } catch (error) {
          console.error('Lobby Question Error:', error);
          const errMsg = (error.message || String(error)).slice(0, 1500);
          return message.reply(`❌ Soru yanıtlanırken bir hata oluştu: \`${errMsg}\``);
        }
      }
  },
  async sendMessageWithFallback(session, prompt) {
    if (process.env.OPENROUTER_API_KEY) {
      const modelName = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
      try {
        const result = await module.exports.callOpenRouter(
          modelName,
          session.systemInstruction,
          session.chatHistory || [],
          prompt
        );

        if (!session.chatHistory) session.chatHistory = [];
        session.chatHistory.push({ role: 'user', content: prompt });
        session.chatHistory.push({ role: 'assistant', content: result.responseText });

        session.modelUsed = result.modelUsed;
        return { result: null, responseText: result.responseText };
      } catch (error) {
        console.error('[DEBUG] OpenRouter sendMessage failed:', error.message);
        throw error;
      }
    }

    const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-flash-latest', 'gemini-1.5-pro', 'gemini-pro-latest'];
    let result = null;
    let responseText = '';
    let lastError = null;

    // Try current model
    try {
      result = await session.chat.sendMessage(prompt);
      responseText = result.response.text();
      return { result, responseText };
    } catch (error) {
      console.error(`[DEBUG] D&D sendMessage failed for model ${session.modelUsed}:`, error.message);
      lastError = error;
    }

    // Fallback: Get history and try other models
    let history = [];
    try {
      history = await session.chat.getHistory();
    } catch (historyError) {
      console.error('[DEBUG] Failed to get chat history:', historyError);
    }

    const alternativeModels = modelsToTry.filter(m => m !== session.modelUsed);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    for (const modelName of alternativeModels) {
      try {
        console.log(`[DEBUG] Attempting fallback with model: ${modelName}`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: session.systemInstruction
        });
        const fallbackChat = model.startChat({ history: history });
        result = await fallbackChat.sendMessage(prompt);
        responseText = result.response.text();

        // Update session
        session.chat = fallbackChat;
        session.modelUsed = modelName;
        console.log(`[DEBUG] Dynamic model migration successful! Switched to: ${modelName}`);
        return { result, responseText };
      } catch (err) {
        console.error(`[DEBUG] Fallback model ${modelName} failed:`, err.message);
        lastError = err;
      }
    }

    throw lastError || new Error('Tüm yapay zeka modelleri başarısız oldu.');
  },
  parseStateUpdates(session, text, triggeringPlayerId) {
    let responseText = text;

    // 1. Parse Sikke: [Sikke: +5 Altın] or [Sikke: -2 Gümüş] or [Sikke: +10 Bronz]
    const coinRegex = /\[Sikke:\s*([+-]?\d+)\s*(Altın|Gümüş|Bronz|Gold|Silver|Bronze)\]/gi;
    let coinMatch;
    let goldChanges = 0;
    while ((coinMatch = coinRegex.exec(responseText)) !== null) {
      const val = parseInt(coinMatch[1]);
      const unit = coinMatch[2].toLowerCase();
      if (unit === 'altın' || unit === 'gold') {
        goldChanges += val * 100;
      } else if (unit === 'gümüş' || unit === 'silver') {
        goldChanges += val * 10;
      } else {
        goldChanges += val;
      }
    }
    responseText = responseText.replace(coinRegex, '');

    // Fallback: Parse old [Altın: +10] format (treating it as Altın = 100 Bronze each)
    const goldRegex = /\[Altın:\s*([+-]?\d+)\]/gi;
    let goldMatch;
    while ((goldMatch = goldRegex.exec(responseText)) !== null) {
      goldChanges += parseInt(goldMatch[1]) * 100;
    }
    responseText = responseText.replace(goldRegex, '');

    if (goldChanges !== 0 && triggeringPlayerId) {
      if (session.economyMode === 'shared') {
        session.sharedGold = Math.max(0, (session.sharedGold || 0) + goldChanges);
      } else {
        const player = session.players.get(triggeringPlayerId);
        if (player) {
          player.gold = Math.max(0, (player.gold || 0) + goldChanges);
        }
      }
    }

    // 2. Parse Can (HP): [Can: -5] or [Can: +10]
    const hpRegex = /\[Can:\s*([+-]\d+)\]/gi;
    let hpMatch;
    let hpChanges = 0;
    while ((hpMatch = hpRegex.exec(responseText)) !== null) {
      hpChanges += parseInt(hpMatch[1]);
    }
    responseText = responseText.replace(hpRegex, '');

    if (hpChanges !== 0) {
      let targetPlayerId = triggeringPlayerId;
      if (!targetPlayerId) {
        for (const [id, p] of session.players) {
          if (responseText.toLowerCase().includes(p.charName.toLowerCase())) {
            targetPlayerId = id;
            break;
          }
        }
        if (!targetPlayerId && session.players.size > 0) {
          targetPlayerId = Array.from(session.players.keys())[0];
        }
      }
      if (targetPlayerId) {
        const player = session.players.get(targetPlayerId);
        if (player) {
          player.hp = Math.max(0, Math.min(player.maxHp, (player.hp || player.maxHp) + hpChanges));
        }
      }
    }

    // 3. Parse Inventory additions/removals: [Envanter: +Yakut]
    const invRegex = /\[Envanter:\s*([+-])([^\]]+)\]/gi;
    let invMatch;
    let addedItems = [];
    let removedItems = [];
    while ((invMatch = invRegex.exec(responseText)) !== null) {
      const operation = invMatch[1];
      const itemName = invMatch[2].trim();
      if (operation === '+') {
        addedItems.push(itemName);
      } else {
        removedItems.push(itemName);
      }
    }
    responseText = responseText.replace(invRegex, '');

    if ((addedItems.length > 0 || removedItems.length > 0) && triggeringPlayerId) {
      const player = session.players.get(triggeringPlayerId);
      if (player) {
        if (!player.inventory) player.inventory = [];
        for (const item of addedItems) {
          player.inventory.push(item);
        }
        for (const item of removedItems) {
          const index = player.inventory.findIndex(i => i.toLowerCase() === item.toLowerCase());
          if (index !== -1) {
            player.inventory.splice(index, 1);
          }
        }
      }
    }

    // 4. Parse Combat Initializer: [Savaş: 1x Vahşi Kurt]
    const combatRegex = /\[Savaş:\s*([^\]]+)\]/gi;
    const combatMatch = combatRegex.exec(responseText);
    let combatTriggered = false;
    let enemyText = '';
    if (combatMatch) {
      enemyText = combatMatch[1].trim();
      if (enemyText.toLowerCase() !== 'bitti' && enemyText.toLowerCase() !== 'end') {
        combatTriggered = true;
      }
      responseText = responseText.replace(combatRegex, '');
    }

    return {
      responseText: responseText.trim(),
      goldChanges,
      hpChanges,
      addedItems,
      removedItems,
      combatTriggered,
      enemyText
    };
  },
  initializeCombat(session, enemyText) {
    session.state = 'combat';

    const enemies = [];
    const parts = enemyText.split(',');
    for (const part of parts) {
      const match = part.trim().match(/^(?:(\d+)x\s*)?(.+)$/i);
      if (match) {
        const count = match[1] ? parseInt(match[1]) : 1;
        const name = match[2].trim();
        for (let i = 0; i < count; i++) {
          enemies.push({
            name: count > 1 ? `${name} ${i + 1}` : name,
            hp: 15,
            maxHp: 15,
            modifier: 1
          });
        }
      }
    }

    const order = [];
    session.players.forEach(p => {
      const dexMod = p.modifiers['El Becerisi'] || 0;
      const d20 = Math.floor(Math.random() * 20) + 1;
      order.push({
        type: 'player',
        id: p.charName.toLowerCase(),
        name: p.charName,
        initiative: d20 + dexMod,
        dex: dexMod
      });
    });

    enemies.forEach((enemy, index) => {
      const d20 = Math.floor(Math.random() * 20) + 1;
      order.push({
        type: 'enemy',
        index: index,
        name: enemy.name,
        initiative: d20 + enemy.modifier,
        dex: enemy.modifier
      });
    });

    order.sort((a, b) => {
      if (b.initiative !== a.initiative) {
        return b.initiative - a.initiative;
      }
      return b.dex - a.dex;
    });

    session.combat = {
      enemies: enemies,
      order: order,
      turnIndex: 0
    };

    return order;
  },
  getCombatOrderEmbed(session) {
    const orderList = session.combat.order.map((e, idx) => {
      const prefix = idx === session.combat.turnIndex ? '👉 ' : '   ';
      const typeIcon = e.type === 'player' ? '👤' : '👾';
      return `${prefix}${idx + 1}. ${typeIcon} **${e.name}** (Girişim: ${e.initiative})`;
    }).join('\n');

    return new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('⚔️ Savaş Başladı! (BG3 Sıra Tabanlı Sıralama)')
      .setDescription([
        'Sıra tabanlı dövüş düzenine geçildi! Girişim (Initiative) zarları otomatik atıldı:',
        '',
        orderList,
        '',
        `⚡ Sıradaki eylem hakkı: **${session.combat.order[session.combat.turnIndex].name}**`
      ].join('\n'))
      .setTimestamp();
  },
  async advanceTurn(session) {
    if (!session.combat) return;

    session.combat.turnIndex = (session.combat.turnIndex + 1) % session.combat.order.length;

    const currentTurn = session.combat.order[session.combat.turnIndex];
    if (currentTurn.type === 'enemy') {
      await session.textChannel.send(`⚔️ **Sıra ${currentTurn.name} (Düşman) tarafında...**`);
      await session.textChannel.sendTyping();

      try {
        const prompt = `[SİSTEM MESAJI - Savaş Sırası]: Sıra düşman ${currentTurn.name}'da. ${currentTurn.name} şu anki duruma göre oyunculara saldırmak için ne yapıyor? Lütfen onun eylemini anlat, hasar verdiyse [Can: -X] etiketiyle can düşür ve hedef oyuncudan savunma/savuşturma zarı iste. Format: [Zar: El Becerisi, Zorluk: 12] vb.`;
        const { responseText } = await module.exports.sendMessageWithFallback(session, prompt);

        const updates = module.exports.parseStateUpdates(session, responseText, null);

        const rollRegex = /\[Zar:\s*(Kuvvet|Dayanıklılık|El Becerisi|Zeka|Bilgelik|Karizma)(?:,\s*Zorluk:\s*(\d+))?\]/i;
        const match = updates.responseText.match(rollRegex);

        const embed = new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle(`⚔️ ${currentTurn.name} Hamlesi`)
          .setDescription(updates.responseText.replace(rollRegex, '').trim())
          .setTimestamp();

        let footerParts = [];
        if (updates.hpChanges !== 0) footerParts.push(`💔 HP: ${updates.hpChanges >= 0 ? '+' : ''}${updates.hpChanges}`);
        if (updates.goldChanges !== 0) {
          const changeSign = updates.goldChanges >= 0 ? '+' : '';
          footerParts.push(`💰 Sikke: ${changeSign}${formatCoins(updates.goldChanges)}`);
        }
        if (updates.addedItems.length > 0) footerParts.push(`🎒 Alınan: ${updates.addedItems.join(', ')}`);
        if (updates.removedItems.length > 0) footerParts.push(`🗑️ Atılan: ${updates.removedItems.join(', ')}`);
        if (footerParts.length > 0) embed.setFooter({ text: footerParts.join(' | ') });

        const components = [];
        if (match) {
          const nextAbility = match[1];
          const nextDifficulty = match[2] ? parseInt(match[2]) : 10;

          let targetPlayerId = null;
          for (const [id, p] of session.players) {
            if (updates.responseText.toLowerCase().includes(p.charName.toLowerCase())) {
              targetPlayerId = id;
              break;
            }
          }
          if (!targetPlayerId) targetPlayerId = Array.from(session.players.keys())[0];

          session.pendingRoll = {
            ability: nextAbility,
            difficulty: nextDifficulty,
            playerId: targetPlayerId
          };

          const button = new ButtonBuilder()
            .setCustomId(`dnd_roll_${nextAbility}`)
            .setLabel(`🎲 ${nextAbility} Zarı At (1d20) - DC ${nextDifficulty}`)
            .setStyle(ButtonStyle.Danger);

          components.push(new ActionRowBuilder().addComponents(button));
        }

        await session.textChannel.send({ embeds: [embed], components: components });

        if (!match) {
          await module.exports.advanceTurn(session);
        }

      } catch (err) {
        console.error('Failed NPC turn:', err);
        await session.textChannel.send('❌ Canavar sırası işlenirken bir hata oluştu. Sıra geçiliyor.');
        await module.exports.advanceTurn(session);
      }
    } else {
      const activePlayer = session.players.get(currentTurn.id);
      await session.textChannel.send(`⚔️ **Sıra sende, ${activePlayer.charName} (${activePlayer.class})!** Ne yapıyorsun? Aksiyonunu yaz.`);
    }
  }
};
