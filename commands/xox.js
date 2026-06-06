const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'xox',
  aliases: ['tictactoe'],
  description: 'Bota karşı 3x3 XOX (Tic-Tac-Toe) oyunu oynar.',
  async execute(message, args, client) {
    const board = Array(9).fill(null); // null, 'X', 'O'
    const playerEmoji = '❌';
    const botEmoji = '⭕';

    const buildBoardComponents = (disableAll = false) => {
      const rows = [];
      for (let i = 0; i < 3; i++) {
        const row = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
          const index = i * 3 + j;
          const button = new ButtonBuilder()
            .setCustomId(`xox_${index}`);

          if (board[index] === 'X') {
            button.setLabel(playerEmoji).setStyle(ButtonStyle.Danger).setDisabled(true);
          } else if (board[index] === 'O') {
            button.setLabel(botEmoji).setStyle(ButtonStyle.Success).setDisabled(true);
          } else {
            button.setLabel('➖').setStyle(ButtonStyle.Secondary).setDisabled(disableAll);
          }
          row.addComponents(button);
        }
        rows.push(row);
      }
      return rows;
    };

    const checkWinner = () => {
      const winLines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6]             // diagonals
      ];
      for (const line of winLines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
          return board[a]; // 'X' or 'O'
        }
      }
      if (board.every(cell => cell !== null)) return 'draw';
      return null;
    };

    const makeBotMove = () => {
      const winLines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
      ];

      // 1. Can bot win?
      for (const line of winLines) {
        const [a, b, c] = line;
        const cells = [board[a], board[b], board[c]];
        const oCount = cells.filter(c => c === 'O').length;
        const nullIndex = cells.indexOf(null);
        if (oCount === 2 && nullIndex !== -1) {
          board[line[nullIndex]] = 'O';
          return;
        }
      }

      // 2. Can player win (block)?
      for (const line of winLines) {
        const [a, b, c] = line;
        const cells = [board[a], board[b], board[c]];
        const xCount = cells.filter(c => c === 'X').length;
        const nullIndex = cells.indexOf(null);
        if (xCount === 2 && nullIndex !== -1) {
          board[line[nullIndex]] = 'O';
          return;
        }
      }

      // 3. Take center if empty
      if (board[4] === null) {
        board[4] = 'O';
        return;
      }

      // 4. Random move
      const emptyIndices = board.map((cell, idx) => cell === null ? idx : null).filter(idx => idx !== null);
      if (emptyIndices.length > 0) {
        const randomIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        board[randomIdx] = 'O';
      }
    };

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎮 XOX Oyunu (Tic-Tac-Toe)')
      .setDescription(`Bota karşı oynuyorsun!\nSenin Sembolün: ${playerEmoji}\nBotun Sembolün: ${botEmoji}\n\nHamle sırası sende!`)
      .setFooter({ text: `${message.author.username} vs Bot` });

    const gameMessage = await message.reply({
      embeds: [embed],
      components: buildBoardComponents()
    });

    const collector = gameMessage.createMessageComponentCollector({
      filter: (i) => i.user.id === message.author.id,
      time: 60000 // 1 minute game timeout
    });

    collector.on('collect', async (interaction) => {
      const customId = interaction.customId;
      const index = parseInt(customId.split('_')[1]);

      if (board[index] !== null) {
        return interaction.reply({ content: '❌ Burası zaten dolu!', ephemeral: true });
      }

      // Player move
      board[index] = 'X';

      // Check after player move
      let winner = checkWinner();
      if (winner) {
        collector.stop(winner);
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(winner === 'X' ? '#57F287' : winner === 'O' ? '#ED4245' : '#95A5A6')
              .setTitle('🎮 XOX Oyunu Bitti')
              .setDescription(winner === 'draw' ? '🤝 Oyun berabere bitti!' : `🏆 Tebrikler, sen kazandın!`)
          ],
          components: buildBoardComponents(true)
        });
      }

      // Bot move
      makeBotMove();

      // Check after bot move
      winner = checkWinner();
      if (winner) {
        collector.stop(winner);
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(winner === 'X' ? '#57F287' : winner === 'O' ? '#ED4245' : '#95A5A6')
              .setTitle('🎮 XOX Oyunu Bitti')
              .setDescription(winner === 'draw' ? '🤝 Oyun berabere bitti!' : `😢 Bot kazandı! Bir dahaki sefere...`)
          ],
          components: buildBoardComponents(true)
        });
      }

      // Continue game
      await interaction.update({
        components: buildBoardComponents()
      });
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        gameMessage.edit({
          embeds: [
            new EmbedBuilder()
              .setColor('#95A5A6')
              .setTitle('🎮 XOX Oyunu Zaman Aşımı')
              .setDescription('⏰ Süre doldu (1 dakika). Oyun iptal edildi.')
          ],
          components: buildBoardComponents(true)
        }).catch(console.error);
      }
    });
  }
};
