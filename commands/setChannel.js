const fs = require('fs');
const path = require('path');

const channelsPath = path.join(__dirname, '../data/channels.json');

module.exports = {
  name: 'setchannel',
  description: 'Set the channel where the bot should post news',
  async execute(interaction) {
    const channel = interaction.channel;
    const guildId = interaction.guild.id;

    let data = {};
    if (fs.existsSync(channelsPath)) {
      data = JSON.parse(fs.readFileSync(channelsPath));
    }

    data[guildId] = channel.id;
    fs.writeFileSync(channelsPath, JSON.stringify(data, null, 2));

    await interaction.reply(`✅ News will now be posted in <#${channel.id}>`);
  },
};
