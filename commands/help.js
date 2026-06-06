const { EmbedBuilder } = require('discord.js');
const { prefix } = require('../config.json');

module.exports = {
  name: 'help',
  description: 'Mevcut tüm komutları listeler.',
  async execute(message, args, client) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📚 Bot Yardım Menüsü')
      .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
      .setDescription(`Merhaba **${message.author.username}**, botumuzun prefixi: \`${prefix}\`\nKomut kategorileri aşağıda detaylı olarak listelenmiştir.`)
      .addFields(
        {
          name: '🎵 Müzik Komutları (Pancake)',
          value: [
            `\`${prefix}play <isim/link>\` - Şarkı/Playlist çalmaya başlar.`,
            `\`${prefix}skip\` - Çalmakta olan şarkıyı atlar.`,
            `\`${prefix}stop\` - Oynatmayı durdurur ve kanaldan ayrılır.`,
            `\`${prefix}queue\` - Çalma sırasını görüntüler.`,
            `\`${prefix}nowplaying\` (np) - Şu an çalan şarkı detaylarını gösterir.`
          ].join('\n')
        },
        {
          name: '🎮 Eğlence & Oyunlar',
          value: [
            `\`${prefix}xox\` - Bota karşı Tic-Tac-Toe (XOX) oynar (Butonlu!).`,
            `\`${prefix}tkm\` - Bota karşı Taş-Kağıt-Makas oynar (Butonlu!).`,
            `\`${prefix}sayitahmin\` - Sayı tahmin etme oyunu oynar.`,
            `\`${prefix}coinflip\` (cf) - Yazı-tura atar.`,
            `\`${prefix}zar\` - 6 yüzlü bir zar atar.`
          ].join('\n')
        },
        {
          name: '🛡️ Moderasyon Komutları',
          value: [
            `\`${prefix}clear <1-99>\` - Kanaldaki mesajları toplu temizler.`,
            `\`${prefix}kick <kullanıcı>\` - Belirtilen üyeyi sunucudan atar.`,
            `\`${prefix}ban <kullanıcı>\` - Belirtilen üyeyi sunucudan yasaklar.`
          ].join('\n')
        },
        {
          name: '⚙️ Genel & Bilgi',
          value: [
            `\`${prefix}help\` - Bu yardım menüsünü görüntüler.`,
            `\`${prefix}ping\` - Botun anlık gecikme süresini gösterir.`,
            `\`${prefix}serverinfo\` - Sunucu hakkında detaylı bilgi gösterir.`,
            `\`${prefix}userinfo\` - Belirtilen kullanıcı hakkında bilgi gösterir.`,
            `\`${prefix}avatar\` (pp) - Kullanıcının profil fotoğrafını gösterir.`
          ].join('\n')
        }
      )
      .setThumbnail(client.user.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: `${message.guild.name} • Profesyonel Destek Botu`, iconURL: message.guild.iconURL() || undefined });

    await message.reply({ embeds: [embed] });
  },
};
