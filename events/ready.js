const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    
    // Set custom activity status (e.g. Playing a!help)
    client.user.setPresence({
      activities: [{ name: 'a!help', type: ActivityType.Playing }],
      status: 'online',
    });
  },
};
