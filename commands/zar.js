module.exports = {
  name: 'zar',
  aliases: ['roll', 'dice'],
  description: '6 yüzlü bir zar atar.',
  execute(message, args, client) {
    const roll = Math.floor(Math.random() * 6) + 1;
    return message.reply(`🎲 Zarı fırlattın ve... **${roll}** geldi!`);
  },
};
