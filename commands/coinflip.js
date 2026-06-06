module.exports = {
  name: 'coinflip',
  aliases: ['yazıtura', 'cf'],
  description: 'Yazı-tura atar.',
  execute(message, args, client) {
    const outcomes = ['Yazı 🪙', 'Tura 🪙'];
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];
    return message.reply(`Para döndü dolaştı ve... **${result}** geldi!`);
  },
};
