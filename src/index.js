import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Events, EmbedBuilder, ActivityType } from 'discord.js';
import mongoose from 'mongoose';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import GlobalBan from './models/GlobalBan.js';
import { sendGlobalLog, logEmbed, initLogChannelCache, getCachedLogChannelId } from './lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [],
});

client.commands = new Collection();

async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');
  const files = readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const filePath = pathToFileURL(join(commandsPath, file)).href;
    const command = await import(filePath);
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`Loaded command: ${command.data.name}`);
    }
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);

  client.user.setPresence({
    activities: [{ name: 'Moderating the Cursed World.', type: ActivityType.Watching }],
    status: 'online',
  });
});

client.on(Events.GuildMemberAdd, async member => {
  try {
    const ban = await GlobalBan.findOne({ userId: member.id }).lean();
    if (!ban) return;
    await member.ban({ reason: `[GlobalBan] ${ban.reason}` });
    await sendGlobalLog(client, logEmbed(
      '🔨 GlobalBan Enforced',
      `**${member.user.tag}** tried to join **${member.guild.name}** but is globally banned.`,
      0x000000,
      [{ name: 'Reason', value: ban.reason }]
    ));
  } catch (err) {
    console.error('GuildMemberAdd handler error:', err.message);
  }
});

client.on(Events.MessageDelete, async message => {
  if (message.partial) return;
  if (!message.guild) return;
  if (message.author?.bot) return;
  if (message.channelId === getCachedLogChannelId()) return;

  await sendGlobalLog(client, logEmbed(
    '🗑️ Message Deleted',
    `A message by **${message.author?.tag || 'Unknown'}** was deleted in <#${message.channelId}> (**${message.guild.name}**)`,
    0x111111,
    [
      { name: 'Content', value: (message.content?.slice(0, 500)) || '*No content / not cached*', inline: false },
      { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
      { name: 'Guild', value: message.guild.name, inline: true },
    ]
  ));
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (newMessage.partial) return;
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  if (newMessage.channelId === getCachedLogChannelId()) return;

  await sendGlobalLog(client, logEmbed(
    '✏️ Message Edited',
    `**${newMessage.author?.tag || 'Unknown'}** edited a message in <#${newMessage.channelId}> (**${newMessage.guild.name}**)`,
    0x111111,
    [
      { name: 'Before', value: (oldMessage.content?.slice(0, 400)) || '*Unknown*', inline: false },
      { name: 'After', value: (newMessage.content?.slice(0, 400)) || '*Unknown*', inline: false },
      { name: 'Channel', value: `<#${newMessage.channelId}>`, inline: true },
    ]
  ));
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    return interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const errEmbed = new EmbedBuilder()
      .setColor(0x111111)
      .setDescription(`❌ An error occurred while running this command.\n\`\`\`${err.message.slice(0, 300)}\`\`\``)
      .setTimestamp();

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errEmbed] }).catch(() => {});
    } else {
      await interaction.reply({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
    }

    await sendGlobalLog(client, logEmbed(
      '⚠️ Command Error',
      `Error in **/${interaction.commandName}** by **${interaction.user.tag}** in **${interaction.guild?.name || 'DM'}**`,
      0x111111,
      [{ name: 'Error', value: err.message.slice(0, 500) }]
    ));
  }
});

async function main() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected');

    await initLogChannelCache();
    console.log('✅ Log channel cache loaded');

    await loadCommands();
    await client.login(process.env.DISCORD_TOKEN);
  } catch (err) {
    console.error('❌ Startup error:', err.message);
    process.exit(1);
  }
}

main();
