const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // REQUIRED for prefix-based commands
    GatewayIntentBits.GuildVoiceStates, // REQUIRED for voice channel access
  ],
});

// Setup collections to store commands and music queue
client.commands = new Collection();
client.queue = new Map();

// Load command files from the commands folder
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('name' in command && 'execute' in command) {
    client.commands.set(command.name, command);
  } else {
    console.warn(`[WARNING] The command at ${filePath} is missing a required "name" or "execute" property.`);
  }
}

// Load event files from the events folder
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  
  if (event.once) {
    client.once(event.name, (...args) => event.execute(client, ...args));
  } else {
    client.on(event.name, (...args) => event.execute(client, ...args));
  }
}

// Handle unhandled promise rejections to prevent bot from crashing
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Log into Discord using the token from the .env file
if (!process.env.TOKEN) {
  console.error('Error: TOKEN is not defined in the .env file.');
  process.exit(1);
}

client.login(process.env.TOKEN);
