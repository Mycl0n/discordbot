const { EmbedBuilder } = require('discord.js');
const { prefix } = require('../config.json');

module.exports = {
  name: 'help',
  description: 'Mevcut tüm komutları listeler.',
  async execute(message, args, client) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📚 Bot Yardım Menüsü')
      .setDescription(`Botumuzun prefixi: \`${prefix}\`\nMevcut komutlar aşağıda listelenmiştir:`)
      .setTimestamp()
      .setFooter({ text: `${message.guild.name || 'Discord Sunucusu'}`, iconURL: message.guild.iconURL() || undefined });

    client.commands.forEach(cmd => {
      embed.addFields({
        name: `\`${prefix}${cmd.name}\``,
        value: cmd.description || 'Açıklama belirtilmedi.',
        inline: true
      });
    });

    await message.reply({ embeds: [embed] });
  },
};
