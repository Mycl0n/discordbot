const { EmbedBuilder } = require('discord.js');
const dnd = require('./dnd.js');

module.exports = {
  name: 'dm',
  description: 'Dungeon Master\'a oyun dışı (out-of-character) sorular sorar.',
  async execute(message, args, client) {
    if (!message.guild) {
      return message.reply('❌ Bu komut sadece sunucularda kullanılabilir.');
    }

    if (!client.dndGames) {
      client.dndGames = new Map();
    }

    const guildId = message.guild.id;
    const session = client.dndGames.get(guildId);

    // Check if session exists and is active in this channel
    if (!session || message.channel.id !== session.channelId) {
      return message.reply('❌ Bu kanalda aktif bir D&D macerası bulunmuyor! D&D oyun kanalına gidip tekrar deneyin.');
    }

    // Check if game is in playing or combat state
    if (session.state !== 'playing' && session.state !== 'combat') {
      return message.reply('❌ Hikaye dışı soruları sadece oyun başladıktan sonra sorabilirsiniz.');
    }

    const question = args.join(' ');
    if (!question) {
      return message.reply('❌ Lütfen DM\'e soracağınız soruyu yazın!\nÖrn: `a!dm köyde bir büyücü dükkanı var mı?`');
    }

    await message.channel.sendTyping();

    try {
      const prompt = `[HİKAYE DIŞI / OUT-OF-CHARACTER (OOC) SORU]: ${question}\n(Lütfen bu soruyu hikayeyi ilerletmeden, karakterlerin eylemlerini işletmeden, tamamen hikaye dışı bir Dungeon Master olarak doğrudan yanıtla. Yanıtın kısa, net ve öz olsun.)`;
      
      const { responseText } = await dnd.sendMessageWithFallback(session, prompt);

      const embed = new EmbedBuilder()
        .setColor('#4F545C')
        .setTitle('🛡️ Dungeon Master (Hikaye Dışı)')
        .setDescription(responseText.trim())
        .setTimestamp()
        .setFooter({ text: 'D&D Out-of-Character Query' });

      return message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('OOC DM Query Error:', error);
      return message.reply(`❌ DM'e soru sorulurken bir hata oluştu: \`${error.message}\``);
    }
  }
};
