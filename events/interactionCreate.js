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
      const player = session.players.get(playerId);
      if (!player) {
        return interaction.reply({ content: '❌ Karakteriniz bulunamadı!', ephemeral: true });
      }

      if (interaction.user.id !== player.userId) {
        return interaction.reply({ content: '❌ Bu zarı sadece hamleyi yapan oyuncu atabilir!', ephemeral: true });
      }

      await interaction.deferUpdate();

      // Clear pending roll to avoid double clicks
      session.pendingRoll = null;

      // Roll d20
      const d20 = Math.floor(Math.random() * 20) + 1;
      
      // Determine modifier
      const modifier = player.modifiers[ability] || 0;
      const total = d20 + modifier;

      // Award Modifier XP
      const modXpGain = d20 === 20 ? 10 : 5;
      if (!player.modifierXp) player.modifierXp = {};
      player.modifierXp[ability] = (player.modifierXp[ability] || 0) + modXpGain;

      // Check for modifier level up
      const conVal = player.modifiers[ability] || 0;
      const modXpNeeded = 30 + (conVal * 10);
      let modLevelUpText = '';
      if (player.modifierXp[ability] >= modXpNeeded) {
        player.modifierXp[ability] -= modXpNeeded;
        player.modifiers[ability] = conVal + 1;
        modLevelUpText = `\n\n🌟 **MODİFİKATÖR GELİŞTİ!**\n**${player.charName}** adlı karakterin **${ability}** modifikatörü kullanıldıkça gelişti! Yeni değeri: **+${player.modifiers[ability]}**!`;
      }

      let rollResultText = `🎲 **${player.charName}** (${player.class}) **${ability}** zarı attı:\n`;
      rollResultText += `**Doğal Zar:** ${d20} | **Modifikatör:** ${modifier >= 0 ? '+' : ''}${modifier}\n`;
      rollResultText += `🏆 **Toplam Sonuç: ${total}**\n\n`;

      if (d20 === 20) {
        rollResultText += '✨ **KRİTİK BAŞARI! (Natural 20)**';
      } else if (d20 === 1) {
        rollResultText += '💀 **KRİTİK BAŞARISIZLIK! (Natural 1)**';
      }

      rollResultText += modLevelUpText;

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
        const difficulty = session.pendingRoll?.difficulty || 10;

        // Feed the roll result to the AI DM
        let prompt = `[SİSTEM MESAJI]: ${player.charName} (${player.class}) ${ability} zarı attı. `;
        prompt += `Doğal zar: ${d20}, Toplam sonuç: ${total} (Zorluk Sınırı/DC: ${difficulty}). `;
        if (d20 === 20) prompt += 'Kritik başarı (Natural 20) elde etti! ';
        if (d20 === 1) prompt += 'Kritik başarısızlık (Natural 1) elde etti! ';
        if (total >= difficulty) {
          prompt += 'Eylem BAŞARILI oldu. ';
        } else {
          prompt += 'Eylem BAŞARISIZ oldu. ';
        }
        prompt += 'Lütfen bu zar sonucuna göre hikayeyi devam ettir, sonucunu anlat.';

        const dndCommand = client.commands.get('dnd');
        const { responseText } = await dndCommand.sendMessageWithFallback(session, prompt);

        // Parse state updates
        const updates = dndCommand.parseStateUpdates(session, responseText, playerId);

        // Calculate XP & Level Up
        let xpGained = total >= difficulty ? 5 : 2;
        if (d20 === 20) xpGained = 10;

        player.xp = (player.xp || 0) + xpGained;

        let nextLevelXp = 25;
        if (player.level === 2) nextLevelXp = 60;
        if (player.level === 3) nextLevelXp = 120;

        let levelUpMessage = '';
        if (player.xp >= nextLevelXp) {
          player.level = (player.level || 1) + 1;
          player.xp = player.xp - nextLevelXp;

          let hpIncrease = 5;
          if (player.class === 'Savaşçı') hpIncrease = 6;
          else if (player.class === 'Büyücü') hpIncrease = 4;
          else if (player.class === 'Hırsız') hpIncrease = 5;
          else if (player.class === 'Rahip') hpIncrease = 5;

          player.maxHp = (player.maxHp || 20) + hpIncrease;
          player.hp = player.maxHp;

          // Check if any spells are unlocked at this level
          const dndCommand = client.commands.get('dnd');
          const classAbilities = dndCommand.CLASS_ABILITIES?.[player.class] || {};
          const levelAbilities = classAbilities[player.level] || [];
          
          let newSpellMessage = '';
          if (levelAbilities.length > 0) {
            newSpellMessage = `\n🔮 **Yeni Yetenek(ler) Açıldı:** ` + levelAbilities.map(a => `**${a.name}** (*${a.desc}*)`).join(', ');
          }

          levelUpMessage = `\n\n🌟 **TEBRİKLER! SEVİYE ATLADI!** 🌟\n**${player.charName}** artık **Seviye ${player.level}**! Maksimum Canı **${player.maxHp}** HP'ye yükseldi!${newSpellMessage}`;
        }

        // Check if the AI wants another roll check
        const rollRegex = /\[Zar:\s*(Kuvvet|Dayanıklılık|El Becerisi|Zeka|Bilgelik|Karizma)(?:,\s*Zorluk:\s*(\d+))?\]/i;
        const match = updates.responseText.match(rollRegex);

        const replyEmbed = new EmbedBuilder()
          .setColor(session.state === 'combat' ? '#ED4245' : '#5865F2')
          .setTitle(session.state === 'combat' ? '⚔️ Savaş - Dungeon Master' : '🛡️ Dungeon Master')
          .setDescription(updates.responseText.replace(rollRegex, '').trim() + levelUpMessage)
          .setTimestamp();

        // Print changes footer if any
        let footerParts = [];
        if (updates.hpChanges !== 0) footerParts.push(`💔 HP: ${updates.hpChanges >= 0 ? '+' : ''}${updates.hpChanges}`);
        if (updates.goldChanges !== 0) {
          const changeSign = updates.goldChanges >= 0 ? '+' : '';
          footerParts.push(`💰 Sikke: ${changeSign}${dndCommand.formatCoins(updates.goldChanges)}`);
        }
        if (updates.addedItems.length > 0) footerParts.push(`🎒 Çantaya Eklenen: ${updates.addedItems.join(', ')}`);
        if (updates.removedItems.length > 0) footerParts.push(`🗑️ Çantadan Çıkarılan: ${updates.removedItems.join(', ')}`);
        if (footerParts.length > 0) replyEmbed.setFooter({ text: footerParts.join(' | ') });

        const components = [];
        if (match) {
          const nextAbility = match[1];
          const nextDifficulty = match[2] ? parseInt(match[2]) : 10;

          session.pendingRoll = {
            ability: nextAbility,
            difficulty: nextDifficulty,
            playerId: playerId
          };

          const button = new ButtonBuilder()
            .setCustomId(`dnd_roll_${nextAbility}`)
            .setLabel(`🎲 ${nextAbility} Zarı At (1d20) - DC ${nextDifficulty}`)
            .setStyle(session.state === 'combat' ? ButtonStyle.Danger : ButtonStyle.Primary);

          const row = new ActionRowBuilder().addComponents(button);
          components.push(row);
        }

        await session.textChannel.send({
          embeds: [replyEmbed],
          components: components
        });

        // Trigger combat or advance turn order
        if (updates.combatTriggered && session.state !== 'combat') {
          dndCommand.initializeCombat(session, updates.enemyText);
          const combatEmbed = dndCommand.getCombatOrderEmbed(session);
          await session.textChannel.send({ embeds: [combatEmbed] });
          await dndCommand.advanceTurn(session);
        } else if (session.state === 'combat') {
          if (updates.responseText.toLowerCase().includes('[savaş: bitti]') || updates.responseText.toLowerCase().includes('[savas: bitti]')) {
            session.state = 'playing';
            session.combat = null;
            await session.textChannel.send('🏆 **Savaş Bitti! Düşmanlar temizlendi.**');
          } else if (!match) {
            await dndCommand.advanceTurn(session);
          }
        }

      } catch (error) {
        console.error('D&D AI Chat Error:', error);
        await session.textChannel.send('❌ Yapay zekadan yanıt alınırken bir hata oluştu. Lütfen komut veya aksiyon ile tekrar deneyin.');
      }
    }
  }
};
