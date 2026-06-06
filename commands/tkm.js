const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'tkm',
  aliases: ['rps'],
  description: 'Bota karşı Taş-Kağıt-Makas oyunu oynar.',
  async execute(message, args, client) {
    const choices = [
      { name: 'Taş', emoji: '🪨', id: 'tas' },
      { name: 'Kağıt', emoji: '📄', id: 'kagit' },
      { name: 'Makas', emoji: '✂️', id: 'makas' }
    ];

    const row = new ActionRowBuilder().addComponents(
      choices.map(c => 
        new ButtonBuilder()
          .setCustomId(`tkm_${c.id}`)
          .setLabel(c.name)
          .setEmoji(c.emoji)
          .setStyle(ButtonStyle.Primary)
      )
    );

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎮 Taş - Kağıt - Makas')
      .setDescription('Aşağıdaki butonlardan birine basarak hamleni yap!')
      .setFooter({ text: `${message.author.username} bota karşı oynuyor` });

    const gameMessage = await message.reply({
      embeds: [embed],
      components: [row]
    });

    const collector = gameMessage.createMessageComponentCollector({
      filter: (i) => i.user.id === message.author.id,
      time: 30000,
      max: 1
    });

    collector.on('collect', async (interaction) => {
      const userChoiceId = interaction.customId.split('_')[1];
      const userChoice = choices.find(c => c.id === userChoiceId);

      const botChoice = choices[Math.floor(Math.random() * choices.length)];

      let resultText = '';
      let resultColor = '#95A5A6'; // Grey for draw

      if (userChoice.id === botChoice.id) {
        resultText = '🤝 Berabere!';
      } else if (
        (userChoice.id === 'tas' && botChoice.id === 'makas') ||
        (userChoice.id === 'kagit' && botChoice.id === 'tas') ||
        (userChoice.id === 'makas' && botChoice.id === 'kagit')
      ) {
        resultText = '🏆 Kazandın!';
        resultColor = '#57F287'; // Green for win
      } else {
        resultText = '😢 Kaybettin!';
        resultColor = '#ED4245'; // Red for loss
      }

      // Disable buttons
      const disabledRow = new ActionRowBuilder().addComponents(
        choices.map(c => 
          new ButtonBuilder()
            .setCustomId(`tkm_disabled_${c.id}`)
            .setLabel(c.name)
            .setEmoji(c.emoji)
            .setStyle(c.id === userChoice.id ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(true)
        )
      );

      const resultEmbed = new EmbedBuilder()
        .setColor(resultColor)
        .setTitle('🎮 Taş - Kağıt - Makas Sonucu')
        .addFields(
          { name: `Senin Seçimin`, value: `${userChoice.emoji} ${userChoice.name}`, inline: true },
          { name: `Botun Seçimi`, value: `${botChoice.emoji} ${botChoice.name}`, inline: true },
          { name: `Sonuç`, value: `**${resultText}**`, inline: false }
        )
        .setTimestamp();

      await interaction.update({
        embeds: [resultEmbed],
        components: [disabledRow]
      });
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        // Disable buttons on timeout
        const timeoutRow = new ActionRowBuilder().addComponents(
          choices.map(c => 
            new ButtonBuilder()
              .setCustomId(`tkm_timeout_${c.id}`)
              .setLabel(c.name)
              .setEmoji(c.emoji)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          )
        );

        gameMessage.edit({
          embeds: [
            new EmbedBuilder()
              .setColor('#95A5A6')
              .setTitle('🎮 Taş - Kağıt - Makas İptal')
              .setDescription('⏰ Süre doldu (30 saniye). Oyun iptal edildi.')
          ],
          components: [timeoutRow]
        }).catch(console.error);
      }
    });
  }
};
