const fs = require('fs');
const path = require('path');

const channelsPath = path.join(__dirname, '../data/channels.json');

module.exports = {
  name: 'setchannel',
  description: 'Set the channel where the bot should post news',
  async execute(interaction) {
    try {
      const channel = interaction.channel;
      const guildId = interaction.guild.id;

      let data = {};
      if (fs.existsSync(channelsPath)) {
        data = JSON.parse(fs.readFileSync(channelsPath));
      }

      data[guildId] = channel.id;
      fs.writeFileSync(channelsPath, JSON.stringify(data, null, 2));

      await interaction.reply({ content: `News will now be posted in <#${channel.id}>`, flags: 64 });
    } catch (error) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Error setting channel.', flags: 64 });
      }
      console.error('setChannel error:', error);
    }
  },
};
