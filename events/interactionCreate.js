const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    // Only handle button interactions
    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    // Check if it's a D&D roll interaction
    if (customId.startsWith('dnd_roll_')) {
      const ability = customId.split('_')[2]; // e.g. 'Kuvvet'
      const session = client.dndGames?.get(interaction.guild.id);

      if (!session) {
        return interaction.reply({ content: '❌ Bu oyun oturumu artık aktif değil!', ephemeral: true });
      }

      if (session.state !== 'playing' || !session.pendingRoll) {
        return interaction.reply({ content: '❌ Şu anda aktif bir zar testi bulunmamaktadır!', ephemeral: true });
      }

      const playerId = session.pendingRoll.playerId;
      if (interaction.user.id !== playerId) {
        return interaction.reply({ content: '❌ Bu zarı sadece hamleyi yapan oyuncu atabilir!', ephemeral: true });
      }

      const player = session.players.get(playerId);
      if (!player) {
        return interaction.reply({ content: '❌ Karakteriniz bulunamadı!', ephemeral: true });
      }

      await interaction.deferUpdate();

      // Clear pending roll to avoid double clicks
      session.pendingRoll = null;

      // Roll d20
      const d20 = Math.floor(Math.random() * 20) + 1;
      
      // Determine modifier
      const modifier = player.modifiers[ability] || 0;
      const total = d20 + modifier;

      let rollResultText = `🎲 **${player.charName}** (${player.class}) **${ability}** zarı attı:\n`;
      rollResultText += `**Doğal Zar:** ${d20} | **Modifikatör:** ${modifier >= 0 ? '+' : ''}${modifier}\n`;
      rollResultText += `🏆 **Toplam Sonuç: ${total}**\n\n`;

      if (d20 === 20) {
        rollResultText += '✨ **KRİTİK BAŞARI! (Natural 20)**';
      } else if (d20 === 1) {
        rollResultText += '💀 **KRİTİK BAŞARISIZLIK! (Natural 1)**';
      }

      const rollEmbed = new EmbedBuilder()
        .setColor(d20 === 20 ? '#57F287' : d20 === 1 ? '#ED4245' : '#5865F2')
        .setTitle('🎲 Zar Atıldı!')
        .setDescription(rollResultText)
        .setTimestamp();

      // Disable the button
      await interaction.editReply({
        components: []
      });

      // Send roll announcement to the text channel
      await session.textChannel.send({ embeds: [rollEmbed] });

      // Send typing status while AI processes
      await session.textChannel.sendTyping();

      try {
        // Feed the roll result to the AI DM
        let prompt = `[SİSTEM MESAJI]: ${player.charName} (${player.class}) ${ability} zarı attı. `;
        prompt += `Doğal zar: ${d20}, Toplam sonuç: ${total}. `;
        if (d20 === 20) prompt += 'Kritik başarı (Natural 20) elde etti! ';
        if (d20 === 1) prompt += 'Kritik başarısızlık (Natural 1) elde etti! ';
        prompt += 'Lütfen bu zar sonucuna göre hikayeyi devam ettir, sonucunu anlat.';

        const result = await session.chat.sendMessage(prompt);
        const responseText = result.response.text();

        // Check if the AI wants another roll check
        const rollRegex = /\[Zar:\s*(Kuvvet|Dayanıklılık|El Becerisi|Zeka|Bilgelik|Karizma)\]/i;
        const match = responseText.match(rollRegex);

        const replyEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🛡️ Dungeon Master')
          .setDescription(responseText.replace(rollRegex, '').trim())
          .setTimestamp();

        const components = [];
        if (match) {
          const nextAbility = match[1];
          // Set next pending roll
          session.pendingRoll = {
            ability: nextAbility,
            playerId: playerId // In simple play, same player rolls next check, or we let them assign
          };

          const button = new ButtonBuilder()
            .setCustomId(`dnd_roll_${nextAbility}`)
            .setLabel(`🎲 ${nextAbility} Zarı At (1d20)`)
            .setStyle(ButtonStyle.Primary);

          const row = new ActionRowBuilder().addComponents(button);
          components.push(row);
        }

        await session.textChannel.send({
          embeds: [replyEmbed],
          components: components
        });

      } catch (error) {
        console.error('D&D AI Chat Error:', error);
        await session.textChannel.send('❌ Yapay zekadan yanıt alınırken bir hata oluştu. Lütfen `a!dnd aksiyon <eylem>` yazarak tekrar deneyin.');
      }
    }
  }
};
