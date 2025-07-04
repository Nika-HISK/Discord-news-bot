require("dotenv").config();
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Discord bot is running.");
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const channelsPath = path.join(__dirname, "data/channels.json");
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
client.commands = new Collection();

const setChannelCommand = require("./commands/setChannel.js");
client.commands.set(setChannelCommand.name, setChannelCommand);

// Helper to read and write channels.json safely
function getChannelsMap() {
  if (!fs.existsSync(channelsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(channelsPath));
  } catch {
    return {};
  }
}
function setChannelsMap(map) {
  fs.writeFileSync(channelsPath, JSON.stringify(map, null, 2));
}

// When bot joins a new server, pick a default channel and store it
client.on(Events.GuildCreate, async (guild) => {
  // Find a text channel the bot can send messages in
  const channel = guild.channels.cache.find(
    (ch) =>
      ch.type === 0 && // 0 = GuildText
      ch.viewable &&
      ch.permissionsFor(guild.members.me).has(["SendMessages", "ViewChannel"])
  );
  if (channel) {
    const channelsMap = getChannelsMap();
    channelsMap[guild.id] = channel.id;
    setChannelsMap(channelsMap);
    // Optionally send a welcome/news message
    channel.send("🤖 Thanks for adding me! I'll post news here.");
  }
});

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: [
      new SlashCommandBuilder()
        .setName("setchannel")
        .setDescription("Set the channel for news posts")
        .toJSON(),
    ],
  });
  console.log("✅ Slash commands registered.");


  cron.schedule("*/15 * * * *", async () => {
    const newsByGuild = getChannelsMap();
    const articlesTech = await fetchNews("technology");
    const articlesWorld = await fetchNews("israel iran");

    for (const [guildId, channelId] of Object.entries(newsByGuild)) {
      try {
        const channel = await client.channels.fetch(channelId);
        await sendNews(articlesTech, "🧠 Tech News", channel, guildId);
        await sendNews(articlesWorld, "🌍 Israel-Iran News", channel, guildId);
      } catch (err) {
        console.error(`❌ Failed to post in guild ${guildId}: ${err.message}`);
      }
    }
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "❌ Error executing command",
      flags: 64,
    });
  }
});

const fetchNews = async (query = "technology") => {
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
    query
  )}&sortBy=publishedAt&language=en&pageSize=1&apiKey=${process.env.NEWS_API_KEY}`;
  const res = await axios.get(url);
  return res.data.articles;
};

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite-001:generateContent?key=" +
  process.env.GOOGLE_API_KEY;

const summarizeWithGemini = async (text) => {
  try {
    const requestBody = {
      contents: [
        {
          parts: [{ text: `Summarize in 2 sentences:\n${text}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        candidateCount: 1,
        maxOutputTokens: 256,
        topP: 0.95,
        topK: 40,
      },
    };

    const response = await axios.post(GEMINI_API_URL, requestBody);
    const summary =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    return summary ? summary.trim() : null;
  } catch (e) {
    console.error("Gemini API Error:", e.response?.data || e.message);
    return null;
  }
};

const postedUrlsByGuild = {};

const sendNews = async (articles, title, channel, guildId) => {
  if (!articles.length) return;
  const article = articles[0];
  if (!postedUrlsByGuild[guildId]) postedUrlsByGuild[guildId] = new Set();
  if (postedUrlsByGuild[guildId].has(article.url)) return;
  postedUrlsByGuild[guildId].add(article.url);

  const date = new Date(article.publishedAt);
  const formattedDate = date.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const summary = await summarizeWithGemini(
    article.content || article.description || article.title
  );

  await channel.send({
    embeds: [
      {
        title: article.title,
        url: article.url,
        description: summary || "_Summary unavailable_",
        image: article.urlToImage ? { url: article.urlToImage } : undefined,
        footer: {
          text: `Published: ${formattedDate} | Source: ${
            article.source?.name || "Unknown"
          }`,
        },
      },
    ],
  });
};

client.login(process.env.DISCORD_TOKEN);