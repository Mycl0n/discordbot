const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'sayitahmin',
  aliases: ['tahmin', 'guess'],
  description: '1-100 arası tutulan sayıyı tahmin etme oyunu.',
  async execute(message, args, client) {
    const targetNumber = Math.floor(Math.random() * 100) + 1;
    let attempts = 0;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎮 Sayı Tahmin Oyunu')
      .setDescription('1 ile 100 arasında bir sayı tuttum! Tahmininizi sohbete yazarak başlayın.\nOyunu bitirmek için `iptal` yazabilirsiniz.')
      .setFooter({ text: 'Tahmin etmek için 1 dakikanız var!' });

    const gameMessage = await message.reply({ embeds: [embed] });

    const filter = (m) => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({
      filter,
      time: 60000 // 1 minute total game time
    });

    collector.on('collect', async (m) => {
      const content = m.content.trim().toLowerCase();

      if (content === 'iptal') {
        collector.stop('user_cancel');
        return;
      }

      const guess = parseInt(content);
      if (isNaN(guess)) {
        return m.reply('❌ Lütfen geçerli bir sayı girin!').then(msg => {
          setTimeout(() => msg.delete().catch(() => {}), 3000);
        });
      }

      attempts++;

      if (guess === targetNumber) {
        collector.stop('success');
        const winEmbed = new EmbedBuilder()
          .setColor('#57F287')
          .setTitle('🏆 Tebrikler, Kazandınız!')
          .setDescription(`Tuttuğum sayı: **${targetNumber}**\nToplam Deneme: **${attempts}**`)
          .setTimestamp();
        await m.reply({ embeds: [winEmbed] });
      } else if (guess < targetNumber) {
        await m.reply(`📈 Daha **büyük** bir sayı deneyin! (Deneme: ${attempts})`);
      } else {
        await m.reply(`📉 Daha **küçük** bir sayı deneyin! (Deneme: ${attempts})`);
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        await gameMessage.reply(`😢 Süreniz doldu! Tuttuğum sayı **${targetNumber}** idi.`);
      } else if (reason === 'user_cancel') {
        await gameMessage.reply(`❌ Oyun iptal edildi. Tuttuğum sayı **${targetNumber}** idi.`);
      }
    });
  }
};
