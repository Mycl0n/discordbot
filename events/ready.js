const { Events, ActivityType } = require('discord.js');
const { prefix } = require('../config.json');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    
    // Rotate activities to make the bot look dynamic and professional
    const statusList = [
      { name: `${prefix}help | Mycl0n's Bot`, type: ActivityType.Listening },
      { name: '🎵 Müzik Dinliyor', type: ActivityType.Playing },
      { name: '🎮 Eğlence & Oyunlar', type: ActivityType.Playing },
      { name: `👥 ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)} Kullanıcı!`, type: ActivityType.Watching }
    ];

    let index = 0;
    setInterval(() => {
      client.user.setPresence({
        activities: [statusList[index]],
        status: 'online',
      });
      index = (index + 1) % statusList.length;
    }, 15000);

    // Initial set
    client.user.setPresence({
      activities: [statusList[0]],
      status: 'online',
    });
  },
};
