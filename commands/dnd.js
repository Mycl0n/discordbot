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

function normalizeTurkish(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/i̇/g, 'i') // combining dot
    .replace(/\u0130/g, 'i')
    .replace(/\u0131/g, 'i');
}

function updateInventory(inventory, itemName, changeAmount) {
  if (!inventory) return;
  const cleanItemName = normalizeTurkish(itemName);
  
  let foundIndex = -1;
  for (let i = 0; i < inventory.length; i++) {
    const item = normalizeTurkish(inventory[i]);
    
    // Check if matching arrow/ok container
    if (cleanItemName === 'ok' && item.includes('ok')) {
      foundIndex = i;
      break;
    }
    // Match exact string
    if (item === cleanItemName) {
      foundIndex = i;
      break;
    }
    // Match base name for prefix quantity, e.g. if inventory has "2x Meşale" and itemName is "Meşale"
    const prefixMatch = inventory[i].match(/^(\d+)\s*x\s*(.+)$/i);
    if (prefixMatch && normalizeTurkish(prefixMatch[2]) === cleanItemName) {
      foundIndex = i;
      break;
    }
    // Match base name for suffix quantity, e.g. if inventory has "Meşale (2)" and itemName is "Meşale"
    const suffixMatch = inventory[i].match(/^(.+)\s*\((\d+)\)$/i);
    if (suffixMatch && normalizeTurkish(suffixMatch[1]) === cleanItemName) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex !== -1) {
    const currentItem = inventory[foundIndex];
    
    // Check if it's arrow count in arrow container (e.g. "Ok Kını (20 Ok)")
    const arrowMatch = currentItem.match(/(\d+)\s*ok/i);
    if (arrowMatch) {
      const currentQty = parseInt(arrowMatch[1]);
      const newQty = Math.max(0, currentQty + changeAmount);
      inventory[foundIndex] = currentItem.replace(/(\d+)\s*ok/i, `${newQty} Ok`);
      return;
    }

    // Check if it has "Nx Item" prefix format
    const prefixMatch = currentItem.match(/^(\d+)\s*x\s*(.+)$/i);
    if (prefixMatch) {
      const currentQty = parseInt(prefixMatch[1]);
      const name = prefixMatch[2].trim();
      const newQty = currentQty + changeAmount;
      if (newQty <= 0) {
        inventory.splice(foundIndex, 1);
      } else {
        inventory[foundIndex] = `${newQty}x ${name}`;
      }
      return;
    }

    // Check if it has "Item (N)" suffix format
    const suffixMatch = currentItem.match(/^(.+)\s*\((\d+)\)$/i);
    if (suffixMatch) {
      const name = suffixMatch[1].trim();
      const currentQty = parseInt(suffixMatch[2]);
      const newQty = currentQty + changeAmount;
      if (newQty <= 0) {
        inventory.splice(foundIndex, 1);
      } else {
        inventory[foundIndex] = `${name} (${newQty})`;
      }
      return;
    }

    // It's a simple item with no quantity (e.g. "Domuz Derisi")
    if (changeAmount < 0) {
      inventory.splice(foundIndex, 1);
    } else if (changeAmount > 0) {
      // Convert to quantity format
      inventory[foundIndex] = `${1 + changeAmount}x ${currentItem}`;
    }
  } else {
    // Item not found in inventory, add it
    if (changeAmount > 0) {
      if (changeAmount === 1) {
        inventory.push(itemName);
      } else {
        inventory.push(`${changeAmount}x ${itemName}`);
      }
    }
  }
}


const CLASS_ABILITIES = {
  'Savaşçı': {
    1: [
      { name: 'İkinci Soluk', type: 'short_rest', desc: '1d10 + Seviye can yeniler.' },
      { name: 'Savaş Narası', type: 'short_rest', desc: 'Fazladan bir hamle yapmanızı sağlar.' }
    ],
    2: [
      { name: 'Siper Alma', type: 'turn', cooldown: 2, desc: 'Bir sonraki gelen saldırıyı savuşturur.' }
    ],
    3: [
      { name: 'Kritik Darbe', type: 'long_rest', desc: 'Düşmana çok ağır hasar veren güçlü vuruş.' }
    ]
  },
  'Büyücü': {
    1: [
      { name: 'Işık', type: 'infinite', desc: 'Karanlık bölgeleri aydınlatan sihirli küre yaratır.' },
      { name: 'Alev Oku', type: 'turn', cooldown: 2, desc: 'Hedefe alev fırlatır (1d10 hasar).' },
      { name: 'Kalkan', type: 'turn', cooldown: 3, desc: 'Savunmayı geçici olarak büyük ölçüde artırır.' }
    ],
    2: [
      { name: 'Sihirli Füze', type: 'long_rest', desc: 'Iskalamayan sihirli oklar fırlatır (3x 1d4+1).' }
    ],
    3: [
      { name: 'Alev Topu', type: 'long_rest', desc: 'Geniş bir alandaki tüm düşmanları yakıp yıkar.' }
    ]
  },
  'Hırsız': {
    1: [
      { name: 'Kurnaz Eylem', type: 'infinite', desc: 'Savaşta hızlıca saklanmanızı veya kaçmanızı sağlar.' },
      { name: 'Sinsi Saldırı', type: 'turn', cooldown: 2, desc: 'Fark edilmeden yapılan vuruşlara büyük hasar ekler.' }
    ],
    2: [
      { name: 'Zehirli Hançer', type: 'short_rest', desc: 'Hedefi zehirleyerek tur başına hasar verir.' }
    ],
    3: [
      { name: 'Gölge Adımı', type: 'long_rest', desc: 'Gölgelerin arasından ışınlanıp görünmez olursunuz.' }
    ]
  },
  'Rahip': {
    1: [
      { name: 'Rehberlik', type: 'infinite', desc: 'Bir sonraki yetenek zarına +1d4 rehberlik ekler.' },
      { name: 'Kutsama', type: 'turn', cooldown: 3, desc: 'Dostların zarlarına kutsal güç ekler.' },
      { name: 'Yaraları İyileştir', type: 'short_rest', desc: 'Dokunarak bir dostun canını yeniler.' }
    ],
    2: [
      { name: 'İlahi Tarama', type: 'infinite', desc: 'Etraftaki kötülükleri veya kutsal varlıkları sezer.' }
    ],
    3: [
      { name: 'Kutsal Ateş', type: 'long_rest', desc: 'Gökyüzünden ilahi bir ışık sütunu indirerek yakar.' }
    ]
  },
  'Korucu': {
    1: [
      { name: 'Keskin Göz', type: 'infinite', desc: 'Dikkat ve algı testlerinde üstünlük sağlar.' },
      { name: 'Avcının Markası', type: 'turn', cooldown: 2, desc: 'Hedeflenen düşmana yapılan vuruşlara hasar ekler.' }
    ],
    2: [
      { name: 'Çoklu Atış', type: 'short_rest', desc: 'Aynı anda birden fazla düşmana ok fırlatır.' }
    ],
    3: [
      { name: 'Hayvan Dostu', type: 'long_rest', desc: 'Mücadelede size yardım edecek vahşi hayvan çağırır.' }
    ]
  },
  'Paladin': {
    1: [
      { name: 'Kutsal Işık', type: 'infinite', desc: 'Karanlığı dağıtan kutsal bir parıltı yayar.' },
      { name: 'Kutsal Darbe', type: 'short_rest', desc: 'Vuruşa ekstra ışık hasarı ekler.' },
      { name: 'Sağaltıcı Dokunuş', type: 'long_rest', desc: 'Kutsal güçle yaraları tamamen sarar.' }
    ],
    2: [
      { name: 'Koruma Kalkanı', type: 'short_rest', desc: 'Dostlarını koruyan ilahi bir kalkan oluşturur.' }
    ],
    3: [
      { name: 'İntikam Yemini', type: 'long_rest', desc: 'Bir hedefe karşı tüm saldırıları avantajlı kılar.' }
    ]
  },
  'Ozan': {
    1: [
      { name: 'Melodi', type: 'infinite', desc: 'Dostları rahatlatan veya dikkat dağıtan ezgi çalar.' },
      { name: 'Tasha Kahkahası', type: 'turn', cooldown: 3, desc: 'Hedefi gülme krizine sokarak saf dışı bırakır.' },
      { name: 'Ozan İlhamı', type: 'short_rest', desc: 'Bir dostuna ilham vererek zarlarına ekleme yapar.' }
    ],
    2: [
      { name: 'Kakofoni', type: 'short_rest', desc: 'Gürültülü ses dalgalarıyla hedefe hasar verir.' }
    ],
    3: [
      { name: 'Kahramanlık Şarkısı', type: 'long_rest', desc: 'Tüm grubun canını ve cesaretini artırır.' }
    ]
  },
  'Barbar': {
    1: [
      { name: 'Pervasız Saldırı', type: 'infinite', desc: 'Saldırı zarlarını avantajlı yapar ama size vurmayı kolaylaştırır.' },
      { name: 'Öfke', type: 'long_rest', desc: 'Öfkeye kapılarak hasar direncini ve gücünü artırır.' }
    ],
    2: [
      { name: 'Vahşi Hücum', type: 'short_rest', desc: 'Düşmanın üzerine atılarak onu yere serer.' }
    ],
    3: [
      { name: 'Ezici Darbe', type: 'short_rest', desc: 'Düşmanın savunmasını yok sayan devasa bir darbe.' }
    ]
  },
  'Keşiş': {
    1: [
      { name: 'Hafif Adım', type: 'infinite', desc: 'Gürültü yapmadan sessizce süzülmenizi sağlar.' },
      { name: 'Ki Darbesi', type: 'turn', cooldown: 2, desc: 'Hızlı bir el hamlesiyle ekstra sersemletici vuruş.' },
      { name: 'Sabır Savunması', type: 'short_rest', desc: 'Saldırıları savuşturmak için savunma pozisyonu alır.' }
    ],
    2: [
      { name: 'Seri Yumruklar', type: 'short_rest', desc: 'Çok hızlı şekilde arka arkaya darbeler indirir.' }
    ],
    3: [
      { name: 'Sersemletici Vuruş', type: 'long_rest', desc: 'Düşmanı 1 tur boyunca tamamen kilitleyen vuruş.' }
    ]
  },
  'Warlock': {
    1: [
      { name: 'Karanlık Görüş', type: 'infinite', desc: 'Zifiri karanlıkta bile net görmenizi sağlar.' },
      { name: 'Mistik Patlama', type: 'infinite', desc: 'Uzak mesafeden güçlü büyü enerjisi fırlatır.' }
    ],
    2: [
      { name: 'Cehennem Azabı', type: 'short_rest', desc: 'Saldırganlara tepki olarak cehennem ateşiyle yanıt verir.' }
    ],
    3: [
      { name: 'Ruh Yiyici', type: 'long_rest', desc: 'Düşmanın yaşam enerjisini emerek kendi canını doldurur.' }
    ]
  },
  'Druid': {
    1: [
      { name: 'Yaprak İğneleri', type: 'infinite', desc: 'Doğal iğneler fırlatarak hasar verir.' },
      { name: 'İyileştirici Esinti', type: 'short_rest', desc: 'Yumuşak bir rüzgarla dostların canını yeniler.' },
      { name: 'Doğal Form (Kurt)', type: 'short_rest', desc: 'Vahşi bir kurta dönüşerek savaşır.' }
    ],
    2: [
      { name: 'Diken Büyümesi', type: 'long_rest', desc: 'Alanı keskin dikenlerle kaplayarak hareketi zorlaştırır.' }
    ],
    3: [
      { name: 'Doğanın Öfkesi', type: 'long_rest', desc: 'Doğa güçlerini bir araya getirerek düşmanları sarsar.' }
    ]
  },
  'Sihirbaz': {
    1: [
      { name: 'Alev Atışı', type: 'infinite', desc: 'Düşmana uzaktan alev fırlatır.' },
      { name: 'Kaos Küresi', type: 'turn', cooldown: 2, desc: 'Rastgele enerji türünde hasar veren kaos küresi atar.' }
    ],
    2: [
      { name: 'Büyü Puanı', type: 'short_rest', desc: 'Büyü puanlarını kullanarak büyü yuvası yeniler.' }
    ],
    3: [
      { name: 'Metabüyü', type: 'long_rest', desc: 'Bir büyüyü güçlendirerek menzilini veya hasarını artırır.' }
    ]
  },
  'Mucit': {
    1: [
      { name: 'Sihirli Çekiç', type: 'infinite', desc: 'Basit eşyalara geçici sihirli özellikler aşılar.' },
      { name: 'Ateş Kıvılcımı', type: 'infinite', desc: 'Sanatsal bir düzenekle ateş kıvılcımı fırlatır.' }
    ],
    2: [
      { name: 'Eşya Aşılama', type: 'short_rest', desc: 'Bir silah veya zırha geçici sihirli +1 bonusu kazandırır.' }
    ],
    3: [
      { name: 'Sihirli Top', type: 'long_rest', desc: 'Savaşta size yardım edecek menzilli bir sihirli top kurar.' }
    ]
  }
};

function getPlayerAbilities(className, level) {
  const classData = CLASS_ABILITIES[className] || {
    1: [{ name: 'Temel Hamle', type: 'infinite', desc: 'Basit bir eylem gerçekleştirir.' }],
    2: [{ name: 'Özel Saldırı', type: 'short_rest', desc: 'Daha etkili ve özel bir hamle.' }],
    3: [{ name: 'Nihai Güç', type: 'long_rest', desc: 'Büyük etki yaratan en güçlü hamle.' }]
  };
  const abilities = [];
  for (let lvl = 1; lvl <= level; lvl++) {
    if (classData[lvl]) {
      abilities.push(...classData[lvl]);
    }
  }
  return abilities;
}

function findUsedAbility(text, playerSpells) {
  const cleanText = text.toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
  
  for (const spell of playerSpells) {
    const cleanSpell = spell.toLowerCase()
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
    
    if (cleanText.includes(cleanSpell)) {
      return spell;
    }
  }
  return null;
}

module.exports = {
  name: 'dnd',
  formatCoins,
  CLASS_ABILITIES,
  getPlayerAbilities,
  findUsedAbility,
  updateInventory,
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
          `🔹 \`${prefix}dnd katıl <Karakter Adı> [Irk] <Sınıf>\` - Karakterinizle lobiye katılır.`,
          `  *(Sınıflar: Savasci, Buyucu, Hirsiz, Rahip, Druid, Paladin, Ozan, Barbar, Korucu, Kesis, Warlock, Sihirbaz, Mucit)*`,
          `  *(Irklar: Elf, Cüce, İnsan, Buçukluk, Ejderha Soylu, Yarı-Elf, Yarı-Ork, Tiefling, Gnom)*`,
          `🔹 \`${prefix}dnd oyna\` - Lobideki en az 1 oyuncu hazır olduğunda oyunu ve hikayeyi başlatır.`,
          `🔹 \`${prefix}dnd aksiyon <eylem>\` - Karakterinizin yapmak istediği hareketi yapay zekaya iletir.`,
          `🔹 \`${prefix}dnd durum\` - Oyuncuların Can (HP), çanta ve yetenek durumlarını listeler.`,
          `🔹 \`${prefix}dnd yetenekler\` - Karakterlerin özel yeteneklerini, kullanım sıklıklarını ve bekleme durumlarını gösterir.`,
          `🔹 \`${prefix}dnd dinlen <kisa/uzun>\` - Kısa veya uzun dinlenme yaparak can yeniler ve yetenekleri şarj eder.`,
          `🔹 \`${prefix}dnd bitir\` - Oturumu sonlandırır ve lobi verilerini sıfırlar.`,
          '',
          '👥 **Çoklu Oyuncu Sistemi:**',
          'Birden fazla oyuncu varken herkes sırayla aksiyonunu yazar. Tüm oyuncular aksiyonunu verdikten sonra DM hepsini birlikte değerlendirir ve hikayeyi devam ettirir.',
          '',
          '🎲 **Yetenek Zarı Testleri:**',
          'Yapay zeka bir eyleminiz karşılığında zar atmanızı istediğinde sohbette otomatik olarak **🎲 Zar At** butonu belirecektir. İlgili oyuncu butona basarak zarı atabilir.'
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
          '👉 **`<Karakter Adı> [Irk] <Sınıf>`** *(Örn: `Arda Elf Hirsiz` veya `Arda Hirsiz`)*',
          '',
          '**🎭 Seçilebilir Sınıflar:**',
          '⚔️ **Savasci** | 🧙 **Buyucu** | 🏹 **Hirsiz** | ☀️ **Rahip**',
          '🌿 **Druid** | 🛡️ **Paladin** | 🎵 **Ozan** | 🪓 **Barbar**',
          '🎯 **Korucu** | 🥋 **Kesis** | 😈 **Warlock** | 🔮 **Sihirbaz** | 🔧 **Mucit**',
          '',
          '**🧬 Seçilebilir Irklar (opsiyonel, varsayılan: İnsan):**',
          '🧝 Elf | ⛏️ Cüce | 👤 İnsan | 🍀 Buçukluk | 🐉 Ejderha Soylu',
          '🧝‍♂️ Yarı-Elf | 💪 Yarı-Ork | 😈 Tiefling | 🔬 Gnom',
          '',
          '*Detaylı can, modifikatör ve çanta/yetenek paketiniz katıldığınızda açıklanacaktır.*',
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

      // --- Race Parsing ---
      const RACE_MAP = {
        'elf': 'Elf',
        'cüce': 'Cüce', 'cuce': 'Cüce', 'dwarf': 'Cüce',
        'insan': 'İnsan', 'İnsan': 'İnsan', 'human': 'İnsan',
        'buçukluk': 'Buçukluk', 'bucukluk': 'Buçukluk', 'halfling': 'Buçukluk',
        'ejderha soylu': 'Ejderha Soylu', 'dragonborn': 'Ejderha Soylu', 'ejderhasoylu': 'Ejderha Soylu',
        'yarı-elf': 'Yarı-Elf', 'yari-elf': 'Yarı-Elf', 'yarı elf': 'Yarı-Elf', 'yari elf': 'Yarı-Elf', 'half-elf': 'Yarı-Elf',
        'yarı-ork': 'Yarı-Ork', 'yari-ork': 'Yarı-Ork', 'yarı ork': 'Yarı-Ork', 'yari ork': 'Yarı-Ork', 'half-orc': 'Yarı-Ork',
        'tiefling': 'Tiefling',
        'gnom': 'Gnom', 'gnome': 'Gnom'
      };

      let detectedRace = 'İnsan'; // default
      let cleanedNameParts = charName.split(/\s+/);

      // Try two-word race matches first (e.g. "Ejderha Soylu", "Yarı Elf")
      for (let i = 0; i < cleanedNameParts.length - 1; i++) {
        const twoWord = (cleanedNameParts[i] + ' ' + cleanedNameParts[i + 1]).toLowerCase();
        if (RACE_MAP[twoWord]) {
          detectedRace = RACE_MAP[twoWord];
          cleanedNameParts.splice(i, 2);
          break;
        }
        // Also try hyphenated
        const hyphenated = (cleanedNameParts[i] + '-' + cleanedNameParts[i + 1]).toLowerCase();
        if (RACE_MAP[hyphenated]) {
          detectedRace = RACE_MAP[hyphenated];
          cleanedNameParts.splice(i, 2);
          break;
        }
      }

      // If no two-word race found, try single-word matches
      if (detectedRace === 'İnsan') {
        for (let i = 0; i < cleanedNameParts.length; i++) {
          const word = cleanedNameParts[i].toLowerCase();
          if (RACE_MAP[word]) {
            detectedRace = RACE_MAP[word];
            cleanedNameParts.splice(i, 1);
            break;
          }
        }
      }

      charName = cleanedNameParts.join(' ').trim() || charName;

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
      } else if (['sihirbaz', 'sorcerer', 'kan büyücüsü', 'kanbuyucusu'].includes(charClassInput)) {
        displayClass = 'Sihirbaz';
        maxHp = 14;
        modifiers = { Karizma: 3, Dayanıklılık: 2, 'El Becerisi': 1, Kuvvet: -1, Bilgelik: 0, Zeka: 0 };
        gold = 75;
        inventory = ['Sihirli Küre', 'Sihir Asası', 'Basit Cübbe', '1x Sağlık İksiri'];
        spells = ['Alev Atışı', 'Kaos Küresi'];
      } else if (['mucit', 'sanatkar', 'artificer'].includes(charClassInput)) {
        displayClass = 'Mucit';
        maxHp = 16;
        modifiers = { Zeka: 3, Dayanıklılık: 2, 'El Becerisi': 1, Kuvvet: -1, Bilgelik: 0, Karizma: 0 };
        gold = 80;
        inventory = ['Alet Çantası', 'Hafif Çapraz Yay', 'Deri Zırh', 'Tamirci Takımı'];
        spells = ['Sihirli Çekiç', 'Ateş Kıvılcımı'];
      } else {
        displayClass = charClassInput.charAt(0).toUpperCase() + charClassInput.slice(1);
        maxHp = 20;
        modifiers = { Kuvvet: 1, Dayanıklılık: 1, 'El Becerisi': 1, Zeka: 1, Bilgelik: 1, Karizma: 1 };
        gold = 50;
        inventory = ['Basit Eşyalar'];
        spells = ['Temel Hamle'];
      }

      session.players.set(playerKey, {
        userId: message.author.id,
        username: message.author.username,
        charName: charName,
        class: displayClass,
        race: detectedRace,
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
          `**Karakter:** **${charName}** (${detectedRace} ${displayClass})`,
          `❤️ **Can (HP):** ${maxHp}/${maxHp}`,
          `💰 **Cüzdan (Sikke):** ${formatCoins(gold)}`,
          `🎒 **Çanta:** ${inventory.join(', ')}`,
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

      session.state = 'selecting_multiplayer';
      return message.reply([
        '👥 **Oyun Modu Seçimi**',
        'Lütfen oyunu oynama biçiminizi seçin:',
        '1️⃣ **Çoklu Karakter / Ortak Hesap (multi)**: Tek veya birden fazla hesap üzerinden birden fazla karakter kontrol edilebilir. Çoklu oyuncu aksiyon senkronizasyonu aktif olur (herkesin yazması beklenir).',
        '2️⃣ **Tek Hesap / Tek Karakter (single)**: Her Discord kullanıcısı sadece kendi karakterini kontrol eder. Çoklu oyuncu bekleme sistemi pasif olur (diğer oyuncuların yazmasını beklemeden hızlı akar).',
        '',
        '👉 Lütfen bu kanala doğrudan **1** (veya **çoklu**) ya da **2** (veya **tek**) yazarak seçim yapın.'
      ].join('\n'));
    }

    // DND SEÇ MULTIPLAYER
    if (subCommand === 'sec_multiplayer') {
      if (!session) return;
      if (session.creatorId !== message.author.id) {
        return message.reply('❌ Oyun modunu sadece lobiyi kuran kişi seçebilir!');
      }

      const mode = args[1]?.toLowerCase();
      if (!['single', 'multi'].includes(mode)) {
        return message.reply('❌ Geçersiz oyun modu.');
      }

      session.multiplayerMode = mode;

      session.state = 'selecting_economy';
      return message.reply([
        `✅ Oyun modu **${mode === 'single' ? 'Tek Hesap / Tek Karakter' : 'Çoklu Karakter / Ortak Hesap'}** olarak seçildi!`,
        '',
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
          '2. OYUNCU ÖZGÜRLÜĞÜ VE YASAKLI DAVRANIŞLAR (KRİTİK):',
          '   - Oyuncuların ne yapacağına, ne düşüneceğine veya ne söyleyeceğine ASLA sen karar verme. Karakterleri sen yönetme.',
          '   - Oyuncuların ağzından kesinlikle konuşma, replik yazma ("Teşekkürler. İyi oynadın." gibi lafları veya diyalogları oyuncular adına üretme). Sadece NPC\'lerin tepkilerini ve çevre olaylarını anlat.',
          '3. ZAR TALEP ETME KURALLARI (KRİTİK VE MUTLAK):',
          '   - Oyuncular bir eylemde zar atmaktan veya kapışmaktan bahsettiklerinde (Örn: "kahvaltı hazırlamak için zar atıyoruz", "el çabukluğu zarı atıyorum", "zar atıp belirleyelim") DM KESİNLİKLE kendisi hikayede zarı atıp sonucunu (savasci (12) vs pelin (8) gibi) yazamaz veya simüle edemez!',
          '   - DM bu durumda hikayeyi kesmeli, sadece zar atılacak ortamı hazırlamalı ve yanıtının sonuna mutlaka ilgili oyuncuların zar etiketlerini eklemelidir (Örn: `[Zar (Arda): El Becerisi] [Zar (pelin): El Becerisi]`).',
          '   - Bir durum veya oda/ortam tasvir ederken, ya da yeni bir canavar/tuzak tanıtırken durup dururken KESİNLİKLE zar testi isteme. Sadece "Ne yapıyorsun?" veya "Ne yapıyorsunuz?" diye sor.',
          '   - Bir zar testi yapıldıktan ve sonucunu açıkladıktan sonra, aynı mesajda KESİNLİKLE yeni bir zar testi isteme. Sonucu anlat, ortamın son durumunu belirt ve "Ne yapıyorsun?" diyerek sırayı oyuncuya devret.',
          '   - Yalnızca oyuncu "a!dnd aksiyon" komutuyla veya doğrudan mesajla riskli, tehlikeli veya başarısızlık ihtimali olan bir eylem gerçekleştirdiğinde o eylemi çözümlemek için zar iste.',
          '   - Eğer oyuncunun eylemi basit, güvenli veya sıradan bir eylemse (Örn: etrafa bakmak, kapıyı kilitli/tuzaklı değilse açmak, güvenli bir şekilde yürümek) zar isteme, sonucu doğrudan anlat ve bir sonraki hamleyi sor.',
          '4. ZAR İSTEME FORMATI: Zar istemek için mesajın EN SONUNA tam olarak şu formatta ekleme yap: `[Zar: Yetenek]`. Yetenek şunlardan biri olmalıdır: Kuvvet, Dayanıklılık, El Becerisi, Zeka, Bilgelik, Karizma. Yeteneği Türkçe yaz.',
          '   - Eğer birden fazla oyuncunun zar atmasını istiyorsan veya belirli bir oyuncudan zar talep ediyorsan, karakter isimlerini belirterek şu formatta yazmalısın: `[Zar (KarakterAdı): Yetenek]`.',
          '     Örnekler: `[Zar (Arda): El Becerisi] [Zar (pelin): El Becerisi]`. Her oyuncu için ayrı bir etiket ekle ki sistem hepsine ayrı buton üretebilsin.',
          '   - Yapay zeka KESİNLİKLE zarları kendisi kurgusal olarak atıp hikayede belirtemez. Mutlaka yukarıdaki etiketleri yazıp butonları aktif etmelidir.',
          '   - Eğer zar istemiyorsan, mesajında kesinlikle bu ifadeler yer almamalıdır.',
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
          '   - Para değişimlerini mesajın sonuna şu formatta etiketler ekleyerek belirt: `[Sikke: +5 Altın]`, `[Sikke: -2 Gümüş]`, `[Sikke: +10 Bronz]`. Eğer birden fazla para birimi değişiyorsa ayrı ayrı ekle (Örn: `[Sikke: -1 Gümüş] [Sikke: -5 Bronz]`).',
          '7. ENVANTER VE EŞYA SİSTEMİ VE EŞYA TRANSFERLERİ (KRİTİK VE ZORUNLU):',
          '   - Oyuncular yeni bir eşya elde ettiğinde veya kaybettiğinde bunu envanter etiketleriyle yanıtının en sonuna ekle.',
          '   - Eşya Transferleri: Eğer bir oyuncu eşyasını bir diğerine veriyorsa/uzatıyorsa, veren oyuncudan düşüp alan oyuncuya eklemeyi KESİNLİKLE UNUTMA! Yanıtının sonuna her iki işlemi birden yazmalısın. Örnek: `[Envanter (Arda): -1 Meşale] [Envanter (pelin): +1 Meşale]`.',
          '   - Eğer eşya belirli bir oyuncuya gidiyorsa ya da ondan çıkıyorsa oyuncunun KARAKTER ADINI belirterek şu formatta yazmalısın: `[Envanter (KarakterAdı): +Eşya Adı]` veya `[Envanter (KarakterAdı): -Eşya Adı]`.',
          '     Örnekler: `[Envanter (Arda): +Karaçalı Hançeri]`, `[Envanter (pelin): +Zümrüt ve Elmas Kaplı Hançer]`, `[Envanter (Arda): -Zümrüt ve Elmas Kaplı Hançer]`.',
          '   - Eğer karakter belirtmezsen etiket `[Envanter: +Eşya]` şeklinde kalırsa eşya eylemi başlatan oyuncunun envanterine işlenir.',
          '   - Miktarlı eşyalar için: `[Envanter (Arda): +3 Domuz Eti]`, `[Envanter (pelin): -1 İksir]`.',
          '8. OTOMATİK ENVANTER GÜNCELLEMELERİ: Oyuncuların yay/ok kullanma, meşale yakma veya iksir içme gibi eylemleri sistem tarafından otomatik olarak envanterden düşülür. Senin bu standart tüketimler için ayrıca `[Envanter: -1 Ok]` yazmana gerek yoktur. Ancak oyuncular arası eşya alışverişlerinde veya NPC\'lerden satın alımlarda/hediyelerde 7. maddedeki envanter etiketlerini kullanmak zorundasın.',
          '9. DND5E WIKIDOT ENTEGRASYONU (KRİTİK): Tüm canavarlar, büyüler, sınıflar, alt sınıflar (subclasses), ırklar, büyülü eşyalar, tuzaklar ve dövüş/keşif kuralları tamamen D&D 5e standartlarına (https://dnd5e.wikidot.com kaynağına) uygun şekilde yönetilmelidir. Oyuncular bu kaynaktaki herhangi bir özelliği, alt sınıf yeteneğini veya büyüyü kullandıklarında DM bu kurallara sadık kalmalıdır. Karşılaşılan canavarlar, NPC\'ler ve hazine eşyaları D&D 5e Monster Manual, Dungeon Master\'s Guide ve Player\'s Handbook kaynaklarına uygun olmalıdır.',
          '10. IRK SİSTEMİ: Her oyuncunun bir ırkı vardır (Elf, Cüce, İnsan, Buçukluk, Ejderha Soylu, Yarı-Elf, Yarı-Ork, Tiefling, Gnom). Irk bilgisi oyuncu detaylarında belirtilmiştir. NPC\'lerin ve çevredeki karakterlerin oyuncuların ırklarına uygun tepkiler vermesini sağla (örn: bir Elf ormanlık bölgelerde doğal avantaja sahip olabilir, bir Tiefling bazı kasabalarda önyargıyla karşılanabilir). Irk özelliklerini D&D 5e kurallarına göre yönet.'
        ].join('\n');

        // Format player list for AI
        const playerDetails = Array.from(session.players.values()).map((p, idx) => {
          return `${idx + 1}. Oyuncu: ${p.username} | Karakteri: ${p.charName} (Irkı: ${p.race || 'İnsan'}, Sınıfı: ${p.class}, Canı: ${p.hp}/${p.maxHp})`;
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

      if (session.pendingRolls && session.pendingRolls.length > 0) {
        const remainingNames = session.pendingRolls.map(r => {
          const targetPlayer = session.players.get(r.playerId);
          return targetPlayer ? targetPlayer.charName : 'Bilinmeyen Karakter';
        }).join(', ');
        return message.reply(`❌ Bekleyen zar testleri var! Önce şu oyuncuların zar atması gerekiyor: **${remainingNames}**`);
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

      // Check if this specific character already submitted an action this round
      if (session.multiplayerMode !== 'single' && session.pendingActions) {
        const alreadyActed = session.pendingActions.get(player.charName.toLowerCase());
        if (alreadyActed) {
          const warnMsg = await message.reply(`❌ **${player.charName}** zaten bu tur aksiyonunu verdi! Diğer oyuncuların aksiyonunu bekleyin.`);
          setTimeout(async () => {
            try { await message.delete(); } catch(e) {}
            try { await warnMsg.delete(); } catch(e) {}
          }, 5000);
          return;
        }
      }

      // Find if they are using an ability
      const classAbilities = getPlayerAbilities(player.class, player.level || 1);
      const usedAbility = findUsedAbility(actionText, classAbilities.map(a => a.name));

      if (usedAbility) {
        const abilityDetails = classAbilities.find(a => a.name.toLowerCase() === usedAbility.toLowerCase());
        if (!player.cooldowns) player.cooldowns = {};

        // Check if on cooldown
        const status = player.cooldowns[usedAbility];
        if (status) {
          let warnReason = '';
          if (status === 'short_rest') {
            warnReason = 'Bu yeteneği tekrar kullanabilmek için **Kısa Dinlenme (Short Rest)** veya **Uzun Dinlenme (Long Rest)** yapmalısınız.';
          } else if (status === 'long_rest') {
            warnReason = 'Bu yeteneği tekrar kullanabilmek için **Uzun Dinlenme (Long Rest)** yapmalısınız.';
          } else if (typeof status === 'number') {
            warnReason = `Bu yetenek bekleme süresinde! Tekrar kullanabilmek için **${status} tur** beklemelisiniz.`;
          }
          
          const warnMsg = await message.reply(`❌ **${player.charName}**, **${usedAbility}** yeteneğini şu an kullanamaz! ${warnReason}`);
          setTimeout(async () => {
            try { await message.delete(); } catch(e) {}
            try { await warnMsg.delete(); } catch(e) {}
          }, 7000);
          return;
        }

        // Set cooldown/rest state
        if (abilityDetails.type === 'turn') {
          player.cooldowns[usedAbility] = abilityDetails.cooldown;
        } else if (abilityDetails.type === 'short_rest') {
          player.cooldowns[usedAbility] = 'short_rest';
        } else if (abilityDetails.type === 'long_rest') {
          player.cooldowns[usedAbility] = 'long_rest';
        }

        // Increment usage counter
        if (!player.abilityUses) player.abilityUses = {};
        player.abilityUses[usedAbility] = (player.abilityUses[usedAbility] || 0) + 1;

        // Append ability use details to the prompt
        actionText += ` [Yetenek Kullanımı: ${abilityDetails.name} (Tür: ${abilityDetails.type}, Etki: ${abilityDetails.desc})]`;
      }

      // Auto-consumption interceptor
      let autoRemoved = [];
      const cleanAction = normalizeTurkish(actionText);

      // 1. Arrows usage detection:
      const hasArrowKeywords = /\b(ok(?:lar|um|u\b|un|a|ta|tan|la)?|yay(?:lar|im|in|a|la)?)\b/i.test(cleanAction) && /\b(at|firlat|kullan|vur|saldir|ger|atis|yirt|savur)/i.test(cleanAction);
      const isMultiShot = usedAbility && (normalizeTurkish(usedAbility) === 'coklu atis');

      if (hasArrowKeywords || isMultiShot) {
        const arrowCount = isMultiShot ? 2 : 1;
        const hasArrows = player.inventory.some(i => normalizeTurkish(i).includes('ok'));
        if (hasArrows) {
          updateInventory(player.inventory, 'ok', -arrowCount);
          autoRemoved.push(`${arrowCount} Ok`);
        }
      }

      // 2. Torch usage detection:
      const hasTorchKeywords = /\bmesale(?:yi|ler|m|den|ye|yle)?\b/i.test(cleanAction) && /\b(yak|kullan|tut|parla)/i.test(cleanAction);
      if (hasTorchKeywords) {
        const hasTorch = player.inventory.some(i => normalizeTurkish(i).includes('mesale'));
        if (hasTorch) {
          updateInventory(player.inventory, 'meşale', -1);
          autoRemoved.push('1 Meşale');
        }
      }

      // 3. Potion usage detection:
      const hasPotionKeywords = /\biksir(?:i|ler|im|den|e|le)?\b/i.test(cleanAction) && /\b(ic|tuket|kullan|yut|bas)/i.test(cleanAction);
      if (hasPotionKeywords) {
        const potionItem = player.inventory.find(i => normalizeTurkish(i).includes('iksir'));
        if (potionItem) {
          const potionName = potionItem.replace(/^\d+x\s*/i, '').replace(/\s*\(\d+\)$/i, '').trim();
          updateInventory(player.inventory, potionName, -1);
          autoRemoved.push(potionName);
        }
      }

      if (autoRemoved.length > 0) {
        actionText += ` [Envanter Tüketimi: ${autoRemoved.join(', ')}]`;
      }

      // --- Multi-player action collection system ---
      if (!session.pendingActions) session.pendingActions = new Map();

      // Store this player's action
      session.pendingActions.set(player.charName.toLowerCase(), {
        player: player,
        actionText: actionText,
        usedAbility: usedAbility,
        autoRemoved: autoRemoved
      });

      const totalPlayers = session.players.size;
      const actedPlayers = session.pendingActions.size;

      // If multiplayerMode is 'single', or actedPlayers >= totalPlayers, we do not wait.
      // Otherwise, show waiting embed
      if (session.multiplayerMode !== 'single' && actedPlayers < totalPlayers) {
        const waitingFor = [];
        session.players.forEach(p => {
          if (!session.pendingActions.has(p.charName.toLowerCase())) {
            waitingFor.push(`**${p.charName}**`);
          }
        });

        const waitEmbed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle('⏳ Aksiyonlar Toplanıyor...')
          .setDescription([
            `✅ **${player.charName}** aksiyonunu verdi: *"${args.slice(1).join(' ')}"*`,
            '',
            `📋 **Durum:** ${actedPlayers}/${totalPlayers} oyuncu aksiyonunu verdi.`,
            `⏳ **Beklenen:** ${waitingFor.join(', ')}`,
            '',
            `*Tüm oyuncular aksiyonunu verdiğinde hikaye devam edecek.*`
          ].join('\n'))
          .setTimestamp();

        return message.reply({ embeds: [waitEmbed] });
      }

      // All players have acted! Combine all actions and send to AI
      await message.channel.sendTyping();

      try {
        // Build combined prompt from all pending actions
        const actionParts = [];
        const allAutoRemoved = [];
        const allUsedAbilities = [];

        session.pendingActions.forEach((actionData, charKey) => {
          actionParts.push(`Karakter: ${actionData.player.charName} (${actionData.player.class}) | Eylem: ${actionData.actionText}`);
          if (actionData.autoRemoved.length > 0) {
            allAutoRemoved.push(...actionData.autoRemoved);
          }
          if (actionData.usedAbility) {
            allUsedAbilities.push({ player: actionData.player, ability: actionData.usedAbility });
          }
        });

        const prompt = `[Oyuncu Hamleleri - Tüm Oyuncular]\n${actionParts.join('\n')}\n\nLütfen tüm oyuncuların eylemlerini birlikte değerlendir ve hikayeyi devam ettir.`;

        const { responseText } = await module.exports.sendMessageWithFallback(session, prompt);

        // Clear pending actions
        session.pendingActions.clear();

        // Outside combat: Decrement turn-based cooldowns for all players by 1
        if (session.state !== 'combat') {
          session.players.forEach(p => {
            if (!p.cooldowns) p.cooldowns = {};
            for (const key of Object.keys(p.cooldowns)) {
              // Skip abilities that were just used this turn
              const justUsed = allUsedAbilities.find(u => 
                u.player.charName.toLowerCase() === p.charName.toLowerCase() && 
                u.ability.toLowerCase() === key.toLowerCase()
              );
              if (justUsed) continue;

              if (typeof p.cooldowns[key] === 'number' && p.cooldowns[key] > 0) {
                p.cooldowns[key]--;
                if (p.cooldowns[key] === 0) {
                  delete p.cooldowns[key];
                }
              }
            }
          });
        }

        // Parse state updates - use triggering player as default for gold/items
        const updates = module.exports.parseStateUpdates(session, responseText, player.charName.toLowerCase());

        // Merge auto-consumed items from ALL players into updates.removedItems for the footer
        if (allAutoRemoved.length > 0) {
          updates.removedItems = [...new Set([...allAutoRemoved, ...updates.removedItems])];
        }

        const embed = new EmbedBuilder()
          .setColor(session.state === 'combat' ? '#ED4245' : '#5865F2')
          .setTitle(session.state === 'combat' ? '⚔️ Savaş - Dungeon Master' : '🛡️ Dungeon Master')
          .setDescription(updates.responseText.trim())
          .setTimestamp();

        // Print changes footer if any
        let footerParts = [];
        if (updates.hpChanges !== 0) footerParts.push(`💔 HP: ${updates.hpChanges >= 0 ? '+' : ''}${updates.hpChanges}`);
        if (updates.goldChanges !== 0) {
          const changeSign = updates.goldChanges >= 0 ? '+' : '';
          footerParts.push(`💰 Sikke: ${changeSign}${formatCoins(updates.goldChanges)}`);
        }
        if (updates.addedItems.length > 0) footerParts.push(`🎒 Çantaya Eklenen: ${updates.addedItems.join(', ')}`);
        if (updates.removedItems.length > 0) footerParts.push(`🗑️ Çantadan Çıkarılan: ${updates.removedItems.join(', ')}`);
        if (footerParts.length > 0) embed.setFooter({ text: footerParts.join(' | ') });

        const components = [];
        let hasRolls = updates.requestedRolls && updates.requestedRolls.length > 0;
        if (hasRolls) {
          const row = new ActionRowBuilder();
          
          if (!session.pendingRolls) session.pendingRolls = [];

          for (const req of updates.requestedRolls) {
            let targetId = player.charName.toLowerCase();
            if (req.targetChar) {
              for (const [id, p] of session.players) {
                if (p.charName.toLowerCase() === req.targetChar.toLowerCase()) {
                  targetId = p.charName.toLowerCase();
                  break;
                }
              }
            } else {
              for (const [id, p] of session.players) {
                if (updates.responseText.toLowerCase().includes(p.charName.toLowerCase())) {
                  targetId = p.charName.toLowerCase();
                  break;
                }
              }
            }

            const targetPlayerObj = session.players.get(targetId);
            const labelName = targetPlayerObj ? targetPlayerObj.charName : req.targetChar || 'Herkes';

            // Add to session list of pending rolls
            session.pendingRolls.push({
              ability: req.ability,
              difficulty: req.difficulty,
              playerId: targetId
            });

            const button = new ButtonBuilder()
              .setCustomId(`dnd_roll_${req.ability}_${targetId}`)
              .setLabel(`🎲 ${labelName} - ${req.ability} Zarı At (DC ${req.difficulty})`)
              .setStyle(session.state === 'combat' ? ButtonStyle.Danger : ButtonStyle.Primary);
            row.addComponents(button);
          }
          components.push(row);
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

    // 5.2 DND YETENEKLER
    if (subCommand === 'yetenekler' || subCommand === 'abilities' || subCommand === 'yetenek' || subCommand === 'ability') {
      if (!session) {
        return message.reply('❌ Aktif bir lobi veya oyun bulunmuyor!');
      }

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔮 Grup Yetenek & Büyü Durumu')
        .setDescription('Karakterlerin özel yetenekleri ve bekleme süreleri:')
        .setTimestamp();

      session.players.forEach(p => {
        const activeAbilities = getPlayerAbilities(p.class, p.level || 1);
        const abilityLines = activeAbilities.map(a => {
          const cd = p.cooldowns?.[a.name];
          const uses = p.abilityUses?.[a.name] || 0;
          let typeText = 'Süresiz';
          if (a.type === 'short_rest') typeText = 'Kısa Rest';
          else if (a.type === 'long_rest') typeText = 'Uzun Rest';
          else if (a.type === 'turn') typeText = `${a.cooldown} Tur Cooldown`;
          
          let statusText = '🟢 Kullanılabilir';
          if (cd === 'short_rest') statusText = '🔴 Beklemede (Reşarj: Kısa Rest)';
          else if (cd === 'long_rest') statusText = '🔴 Beklemede (Reşarj: Uzun Rest)';
          else if (typeof cd === 'number' && cd > 0) statusText = `🔴 Beklemede (${cd} tur kaldı)`;

          return `🔹 **${a.name}** *(Kullanım Sayısı: ${uses})*\n   *Açıklama:* ${a.desc}\n   *Kullanım Türü:* \`${typeText}\` | *Durum:* ${statusText}`;
        }).join('\n\n');

        embed.addFields({
          name: `👤 ${p.charName} (${p.class}) - Seviye ${p.level || 1}`,
          value: abilityLines || 'Bu seviyede özel yetenek bulunmuyor.'
        });
      });

      return message.reply({ embeds: [embed] });
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
        const mods = Object.entries(p.modifiers).map(([k, v]) => {
          const xp = p.modifierXp?.[k] || 0;
          const nextXp = 30 + (v * 10);
          return `${k}: ${v >= 0 ? '+' : ''}${v} (XP: ${xp}/${nextXp})`;
        }).join(', ');

        const activeAbilities = getPlayerAbilities(p.class, p.level || 1);
        const abilityList = activeAbilities.map(a => {
          const cd = p.cooldowns?.[a.name];
          const uses = p.abilityUses?.[a.name] || 0;
          let statusText = '';
          if (cd === 'short_rest') statusText = ' ⏳ (Reşarj: Kısa Rest)';
          else if (cd === 'long_rest') statusText = ' ⏳ (Reşarj: Uzun Rest)';
          else if (typeof cd === 'number' && cd > 0) statusText = ` ⏳ (Bekleme: ${cd} tur)`;
          return `🔹 **${a.name}** *(Kullanım: ${uses})* - *${a.desc}*${statusText}`;
        }).join('\n');

        const fields = [
          `❤️ **Can (HP):** ${p.hp}/${p.maxHp}`,
          `✨ **Tecrübe (XP):** ${p.xp || 0} XP`
        ];
        if (session.economyMode !== 'shared') {
          fields.push(`💰 **Cüzdan (Sikke):** ${formatCoins(p.gold || 0)}`);
        }
        fields.push(
          `🎒 **Çanta:** ${p.inventory.join(', ')}`,
          `🔮 **Yetenekler & Büyüler:**\n${abilityList || 'Yok'}`,
          `📊 **Modifikatörler:** \`${mods}\``
        );

        embed.addFields({
          name: `👤 ${p.charName} (${p.race || 'İnsan'} ${p.class}) - Seviye ${p.level || 1} [Sahibi: ${p.username}]`,
          value: fields.join('\n')
        });
      });

      return message.reply({ embeds: [embed] });
    }

    // 5.25 DND ZAR_AT (Manuel Zar Butonları Oluşturma)
    if (subCommand === 'zar_at' || subCommand === 'zar') {
      if (!session) {
        return message.reply('❌ Aktif bir lobi veya oyun bulunmuyor!');
      }
      if (session.state !== 'playing' && session.state !== 'combat') {
        return message.reply('❌ Oyun henüz başlatılmamış!');
      }

      const abilityInput = args[1];
      const difficultyInput = args[2];

      const validAbilities = ['Kuvvet', 'Dayanıklılık', 'El Becerisi', 'Zeka', 'Bilgelik', 'Karizma'];
      let chosenAbility = 'Kuvvet';
      if (abilityInput) {
        const found = validAbilities.find(a => normalizeTurkish(a) === normalizeTurkish(abilityInput));
        if (found) chosenAbility = found;
      }

      let chosenDC = 10;
      if (difficultyInput && !isNaN(difficultyInput)) {
        chosenDC = parseInt(difficultyInput);
      }

      if (!session.pendingRolls) session.pendingRolls = [];

      const rollEmbed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setTitle('🎲 Manuel Zar Testi')
        .setDescription(`**${chosenAbility}** testi talep edildi (Zorluk Derecesi: DC ${chosenDC}).\nLütfen aşağıdaki kendi karakterinize ait butona tıklayarak zarı atın!`)
        .setTimestamp();

      const rows = [];
      let currentRow = new ActionRowBuilder();
      let buttonCount = 0;

      session.players.forEach((p, playerId) => {
        // Add to session pendingRolls so interaction handler can process it
        session.pendingRolls.push({
          ability: chosenAbility,
          difficulty: chosenDC,
          playerId: playerId
        });

        const button = new ButtonBuilder()
          .setCustomId(`dnd_roll_${chosenAbility}_${playerId}`)
          .setLabel(`🎲 ${p.charName} (${chosenAbility} DC ${chosenDC})`)
          .setStyle(ButtonStyle.Primary);

        currentRow.addComponents(button);
        buttonCount++;

        if (buttonCount === 5) {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder();
          buttonCount = 0;
        }
      });

      if (buttonCount > 0) {
        rows.push(currentRow);
      }

      return message.reply({ embeds: [rollEmbed], components: rows });
    }

    // 5.3 DND ZAR_IPTAL (Bekleyen zarları iptal etme)
    if (subCommand === 'zar_iptal' || subCommand === 'zar_sil' || subCommand === 'iptal') {
      if (!session) {
        return message.reply('❌ Aktif bir lobi veya oyun bulunmuyor!');
      }
      
      if (session.pendingRolls && session.pendingRolls.length > 0) {
        const count = session.pendingRolls.length;
        session.pendingRolls = [];
        return message.reply(`✅ **${count}** adet bekleyen zar testi başarıyla iptal edildi! Artık oyuna bugsız devam edebilirsiniz.`);
      } else {
        return message.reply('❌ Şu anda zaten bekleyen bir zar testi bulunmuyor.');
      }
    }

    // 5.5 DND DİNLEN
    if (subCommand === 'dinlen' || subCommand === 'rest') {
      if (!session || session.state !== 'playing') {
        return message.reply('❌ Şu anda aktif bir oyun oynanmıyor!');
      }

      const type = args[1]?.toLowerCase();
      if (!['kisa', 'kısa', 'short', 'uzun', 'long'].includes(type)) {
        return message.reply('❌ Hatalı Kullanım!\nKullanım: `a!dnd dinlen <kisa/uzun>` veya doğrudan kanala `dinlen kisa` / `dinlen uzun` yazabilirsiniz.');
      }

      await message.channel.sendTyping();

      try {
        const isLong = ['uzun', 'long'].includes(type);
        let restResults = [];

        session.players.forEach(p => {
          if (!p.cooldowns) p.cooldowns = {};
          
          let hpRegained = 0;
          if (isLong) {
            hpRegained = p.maxHp - p.hp;
            p.hp = p.maxHp;
            p.cooldowns = {};
            p.abilityUses = {}; // Fully reset uses on Long Rest
          } else {
            const conMod = p.modifiers['Dayanıklılık'] || 0;
            const d8 = Math.floor(Math.random() * 8) + 1;
            hpRegained = Math.max(1, d8 + conMod);
            p.hp = Math.min(p.maxHp, p.hp + hpRegained);

            // Clear short rest abilities, and reduce turn-based cooldowns by 5
            const classSpells = getPlayerAbilities(p.class, p.level || 1);
            if (!p.abilityUses) p.abilityUses = {};
            for (const key of Object.keys(p.cooldowns)) {
              const spellData = classSpells.find(s => s.name.toLowerCase() === key.toLowerCase());
              if (spellData) {
                if (spellData.type === 'short_rest') {
                  delete p.cooldowns[key];
                  delete p.abilityUses[spellData.name]; // Reset short rest ability uses
                } else if (spellData.type === 'turn') {
                  p.cooldowns[key] = Math.max(0, p.cooldowns[key] - 5);
                  if (p.cooldowns[key] === 0) {
                    delete p.cooldowns[key];
                  }
                }
              }
            }
          }
          restResults.push(`**${p.charName}** (+${hpRegained} HP, Can: ${p.hp}/${p.maxHp})`);
        });

        const restPrompt = `[SİSTEM MESAJI - Dinlenme]: Grubun tamamı bir ${isLong ? 'Uzun Dinlenme (Long Rest)' : 'Kısa Dinlenme (Short Rest)'} gerçekleştirdi. Tüm canları ve yetenek bekleme süreleri buna göre güncellendi. Lütfen bu dinlenme sahnesini, nerede dinlendiklerini, dinlenirken başlarına sakin bir şey gelip gelmediğini veya dinlenme sonrasını tasvir et.`;
        
        const { responseText } = await module.exports.sendMessageWithFallback(session, restPrompt);

        const embed = new EmbedBuilder()
          .setColor(isLong ? '#57F287' : '#5865F2')
          .setTitle(isLong ? '⛺ Uzun Dinlenme (Long Rest)' : '🪵 Kısa Dinlenme (Short Rest)')
          .setDescription([
            `💤 Grup başarıyla dinlendi!`,
            '',
            ...restResults,
            '',
            '✨ **Dungeon Master Anlatımı:**',
            responseText.trim()
          ].join('\n'))
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Rest Command Error:', error);
        const errMsg = (error.message || String(error)).slice(0, 1500);
        return message.reply(`❌ Dinlenme sırasında hata oluştu: \`${errMsg}\``);
      }
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
            'D&D 5e kurallarını ve sistemimizdeki 13 sınıfı (Savaşçı, Büyücü, Hırsız, Rahip, Korucu, Paladin, Ozan, Barbar, Keşiş, Warlock, Druid, Sihirbaz, Mucit) temel al.',
            'Tüm kurallar, alt sınıflar, ırklar, büyüler ve eşyalar hakkında https://dnd5e.wikidot.com kaynağını birincil referans olarak kullan.',
            'Sistemimizde 9 oynanabilir ırk vardır: Elf, Cüce, İnsan, Buçukluk, Ejderha Soylu, Yarı-Elf, Yarı-Ork, Tiefling, Gnom.',
            'Sistemimizde para birimi sikkedir ve Bronz, Gümüş, Altın olarak 3\'e ayrılır (1 Altın = 10 Gümüş, 1 Gümüş = 10 Bronz). Alışverişlerde ve para üstü ödemelerinde bu oranları temel al.',
            '',
            'SİSTEMİMİZDEKİ SINIFLAR, EŞYALAR VE YETENEKLER:',
            '1. Savaşçı: 24 HP | Çanta: Çelik Kılıç, Kalkan, Deri Zırh, 2x Meşale, 5 Gümüş Sikke | Yetenekler: İkinci Soluk (1d10 + Seviye can yeniler), Savaş Narası (fazladan aksiyon).',
            '2. Büyücü: 14 HP | Çanta: Büyücü Asası, Büyü Kitabı, Basit Cübbe, 1x Sağlık İksiri, 8 Gümüş Sikke | Yetenekler/Büyüler: Alev Oku (1d10 hasar), Sihirli Füze (3x 1d4+1 hasar), Kalkan (+5 Zırh Sınıfı).',
            '3. Hırsız: 16 HP | Çanta: 2x Çelik Hançer, Maymuncuk Seti, Hırsız Giysisi, Halat (10m), 12 Gümüş Sikke | Yetenekler: Sinsi Saldırı (+2d6 hasar), Kurnaz Eylem (saklanma/kaçma).',
            '4. Rahip: 18 HP | Çanta: Gümüş Topuz, Kutsal Sembol, Zırhlı Cübbe, 2x Kutsal Su, 6 Gümüş Sikke | Yetenekler/Büyüler: Yaraları İyileştir (1d8+Bilgelik iyileştirme), İlahi Tarama (yakındaki kutsal/tekinsiz varlıkları sezer), Kutsama (zarlara +1d4 ekler).',
            '5. Korucu: 18 HP | Çanta: Uzun Yay, Kısa Kılıç, Deri Zırh, Ok Kını (20 Ok), 7 Gümüş Sikke | Yetenekler: Avcının Markası (hedefe fazladan hasar), Keskin Göz (dikkat ve algı testlerinde kolaylık).',
            '6. Paladin: 22 HP | Çanta: Büyük Kılıç, Kutsal Sembol, Zincir Zırh, 1x İyileştirme İksiri, 6 Gümüş Sikke | Yetenekler: Kutsal Darbe (ekstra kutsal hasar), Sağaltıcı Dokunuş (can iyileştirme).',
            '7. Ozan: 16 HP | Çanta: Lut (Müzik Aleti), Hançer, Deri Ceket, Diplomasi Belgesi, 9 Gümüş Sikke | Yetenekler/Büyüler: Ozan İlhamı (arkadaşına zarda bonus verir), Kakofoni (gürültülü hasar büyüsü), Tasha Kahkahası (hedefi gülme krizine sokarak saf dışı bırakır).',
            '8. Barbar: 28 HP | Çanta: Çift Elli Savaş Baltası, Fırlatma Baltası, Kürk Giysiler, Matara, 4 Gümüş Sikke | Yetenekler: Öfke (alınan hasarı azaltır, vurulan hasarı artırır), Pervasız Saldırı (avantajlı ama riskli saldırı).',
            '9. Keşiş: 18 HP | Çanta: Ahşap Asa, Fırlatma Bıçakları, Basit Keşiş Cübbesi, Bitki Çayı, 4 Gümüş Sikke | Yetenekler: Ki Darbesi (silahsız ekstra hızlı vuruşlar), Sabır Savunması (gelen saldırıları savuşturma).',
            '10. Warlock: 16 HP | Çanta: Karanlık Asa, Kadim Kitap, Gölgeli Cübbe, 1x Ruh Taşı, 7 Gümüş Sikke | Yetenekler/Büyüler: Mistik Patlama (güçlü büyü atışı), Cehennem Azabı (tepki olarak alev hasarı), Karanlık Görüş (karanlıkta görme).',
            '11. Druid: 18 HP | Çanta: Sarmaşık Asa, Şifalı Bitki Çantası, Deri Cübbe, Doğa Sembolü, 5 Gümüş Sikke | Yetenekler/Büyüler: Doğal Form (Kurt formuna dönüşür), Diken Büyümesi (alanı dikenlerle kaplar), İyileştirici Esinti (can yeniler).',
            '12. Sihirbaz (Sorcerer): 14 HP | Çanta: Sihirli Küre, Sihir Asası, Basit Cübbe, 1x Sağlık İksiri, 7.5 Gümüş Sikke | Yetenekler: Alev Atışı (uzaktan alev saldırısı), Kaos Küresi (rastgele enerji türünde hasar). Alt sınıflar: Vahşi Büyü, Ejderha Soyu, Fırtına Büyücülüğü.',
            '13. Mucit (Artificer): 16 HP | Çanta: Alet Çantası, Hafif Çapraz Yay, Deri Zırh, Tamirci Takımı, 8 Gümüş Sikke | Yetenekler: Sihirli Çekiç (eşyalara geçici sihir aşılar), Ateş Kıvılcımı (ateş saldırısı). Alt sınıflar: Alchemist, Artillerist, Battle Smith.'
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
        const player = session.players.get(triggeringPlayerId.toLowerCase());
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
        const player = session.players.get(targetPlayerId.toLowerCase());
        if (player) {
          player.hp = Math.max(0, Math.min(player.maxHp, (player.hp || player.maxHp) + hpChanges));
        }
      }
    }

    // 2.5 Parse Rolls: [Zar: Yetenek] or [Zar (Karakter): Yetenek]
    const rollRegex = /\[Zar\s*(?:\(([^)]+)\))?:\s*(Kuvvet|Dayanıklılık|El Becerisi|Zeka|Bilgelik|Karizma)(?:,\s*Zorluk:\s*(\d+))?\]/gi;
    let rollMatch;
    const requestedRolls = [];
    while ((rollMatch = rollRegex.exec(responseText)) !== null) {
      const targetChar = rollMatch[1] ? rollMatch[1].trim() : null;
      const ability = rollMatch[2].trim();
      const difficulty = rollMatch[3] ? parseInt(rollMatch[3]) : 10;
      requestedRolls.push({ targetChar, ability, difficulty });
    }
    responseText = responseText.replace(rollRegex, '');

    // 3. Parse Inventory additions/removals: [Envanter: +Yakut] or [Envanter (Arda): +Yakut]
    const invRegex = /\[Envanter\s*(?:\(([^)]+)\))?:\s*([+-])([^\]]+)\]/gi;
    let invMatch;
    
    // Store array of updates: { targetChar: string|null, operation: '+'|'-', rawItemName: string }
    const inventoryUpdates = [];
    while ((invMatch = invRegex.exec(responseText)) !== null) {
      const targetChar = invMatch[1] ? invMatch[1].trim() : null;
      const operation = invMatch[2];
      const rawItemName = invMatch[3].trim();
      inventoryUpdates.push({ targetChar, operation, rawItemName });
    }
    responseText = responseText.replace(invRegex, '');

    const parseTagItem = (itemStr) => {
      const match = itemStr.match(/^(\d+)\s*(?:x|adet)?\s*(.+)$/i);
      if (match) {
        return {
          quantity: parseInt(match[1]),
          name: match[2].trim()
        };
      }
      return {
        quantity: 1,
        name: itemStr.trim()
      };
    };

    let addedItems = [];
    let removedItems = [];

    // Process each update targeting the correct player envanter
    for (const update of inventoryUpdates) {
      let targetPlayerId = null;
      if (update.targetChar) {
        // Try to match player by charName
        for (const [id, p] of session.players) {
          if (p.charName.toLowerCase() === update.targetChar.toLowerCase()) {
            targetPlayerId = id;
            break;
          }
        }
      }
      
      // Fallback if no specific target or target not found
      if (!targetPlayerId) {
        targetPlayerId = triggeringPlayerId;
      }
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
          if (!player.inventory) player.inventory = [];
          const parsed = parseTagItem(update.rawItemName);
          const changeSign = update.operation === '+' ? 1 : -1;
          module.exports.updateInventory(player.inventory, parsed.name, changeSign * parsed.quantity);
          
          const formattedString = `${player.charName}: ${update.operation}${parsed.quantity > 1 ? parsed.quantity + 'x ' : ''}${parsed.name}`;
          if (update.operation === '+') {
            addedItems.push(formattedString);
          } else {
            removedItems.push(formattedString);
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
      enemyText,
      requestedRolls
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

    // Decrement turn-based cooldowns for all players on round advance
    session.players.forEach(p => {
      if (!p.cooldowns) p.cooldowns = {};
      for (const key of Object.keys(p.cooldowns)) {
        if (typeof p.cooldowns[key] === 'number' && p.cooldowns[key] > 0) {
          p.cooldowns[key]--;
          if (p.cooldowns[key] === 0) {
            delete p.cooldowns[key];
          }
        }
      }
    });

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
        if (updates.addedItems.length > 0) footerParts.push(`🎒 Çantaya Eklenen: ${updates.addedItems.join(', ')}`);
        if (updates.removedItems.length > 0) footerParts.push(`🗑️ Çantadan Çıkarılan: ${updates.removedItems.join(', ')}`);
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
