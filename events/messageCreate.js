const { Events } = require('discord.js');
const { prefix } = require('../config.json');

module.exports = {
  name: Events.MessageCreate,
  async execute(client, message) {
    const content = message.content;
    const lowerContent = content.toLowerCase();
    const lowerPrefix = prefix.toLowerCase();

    // Ignore messages from other bots or if they don't start with prefix (case-insensitive)
    if (message.author.bot || !lowerContent.startsWith(lowerPrefix)) return;

    // Extract arguments and command name
    const args = content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Check if the command exists (by name or alias)
    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    if (!command) return;

    try {
      await command.execute(message, args, client);
    } catch (error) {
      console.error(`Error executing command "${commandName}":`, error);
      try {
        await message.reply({ content: '❌ Bu komutu çalıştırırken bir hata oluştu!' });
      } catch (err) {
        console.error('Failed to send error reply:', err);
      }
    }
  },
};
