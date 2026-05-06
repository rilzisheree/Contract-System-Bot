import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  EmbedBuilder,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
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

// Stores pending /sendtext approval requests
const pendingRequests = new Map();

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

  // ── Slash commands ────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
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
    return;
  }

  // ── /sendtext modal submission ────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'sendtext_modal') {
    const recipientId = interaction.fields.getTextInputValue('recipient_id').trim();
    const loreName = (interaction.fields.fields.get('lore_name')?.value?.trim()) || '(Unknown)';
    const messageContent = interaction.fields.getTextInputValue('message_content').trim();

    if (!/^\d{17,19}$/.test(recipientId)) {
      return interaction.reply({
        content: "That doesn't look like a valid Discord ID. Please try `/sendtext` again.",
        ephemeral: true,
      });
    }

    await interaction.reply({ content: 'Sending...', ephemeral: true });

    const adminChannel = await client.channels.fetch(process.env.DISCORD_ADMIN_CHANNEL_ID).catch(() => null);
    if (!adminChannel) {
      return interaction.editReply({ content: 'Could not reach the admin channel. Please contact an admin.' });
    }

    const requestId = `${interaction.user.id}-${Date.now()}`;
    pendingRequests.set(requestId, {
      fromUserId: interaction.user.id,
      toUserId: recipientId,
      message: messageContent,
      loreName,
    });

    const embed = new EmbedBuilder()
      .setTitle('📱 Incoming Text — Pending Approval')
      .setColor(0xf0a500)
      .addFields(
        { name: 'From', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
        { name: 'To', value: `<@${recipientId}> (\`${recipientId}\`)`, inline: true },
        { name: 'Message', value: messageContent }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve:${requestId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`decline:${requestId}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    await adminChannel.send({ embeds: [embed], components: [row] });
    return;
  }

  // ── Approve / Decline buttons ─────────────────────────────────────────────
  if (interaction.isButton()) {
    const colonIndex = interaction.customId.indexOf(':');
    if (colonIndex === -1) return;

    const action = interaction.customId.slice(0, colonIndex);
    const requestId = interaction.customId.slice(colonIndex + 1);

    if (!['approve', 'decline'].includes(action)) return;

    const request = pendingRequests.get(requestId);
    if (!request) {
      return interaction.reply({ content: 'This request has already been handled or has expired.', ephemeral: true });
    }

    pendingRequests.delete(requestId);
    const { fromUserId, toUserId, message, loreName } = request;

    const doneRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('done_approve').setLabel('Approved').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(true),
      new ButtonBuilder().setCustomId('done_decline').setLabel('Declined').setStyle(ButtonStyle.Danger).setEmoji('❌').setDisabled(true)
    );

    if (action === 'approve') {
      let deliveryFailed = false;
      try {
        const recipient = await client.users.fetch(toUserId);
        const dmEmbed = new EmbedBuilder()
          .setTitle('A message is sent to your phone!')
          .setDescription(`*"${message}"*`)
          .setColor(0x99aab5)
          .addFields({ name: 'From', value: loreName })
          .setTimestamp();
        await recipient.send({ embeds: [dmEmbed] });
      } catch { deliveryFailed = true; }

      try {
        const sender = await client.users.fetch(fromUserId);
        await sender.send(deliveryFailed ? "Your signal seems to be off, the text doesn't send." : 'Text Message Sent.');
      } catch { /* sender DMs closed */ }

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x2ecc71)
        .setTitle('📱 Text Message Approved — Sent');

      await interaction.update({ embeds: [updatedEmbed], components: [doneRow] });
      await interaction.followUp({
        content: deliveryFailed
          ? `⚠️ Approved by ${interaction.user}, but <@${toUserId}> has DMs closed — delivery failed.`
          : `✅ Approved by ${interaction.user}. Message delivered to <@${toUserId}>.`,
      });
    }

    if (action === 'decline') {
      try {
        const sender = await client.users.fetch(fromUserId);
        await sender.send("Your signal seems to be off, the text doesn't send.");
      } catch { /* sender DMs closed */ }

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0xe74c3c)
        .setTitle('📱 Text Message Declined — Not Sent');

      await interaction.update({ embeds: [updatedEmbed], components: [doneRow] });
      await interaction.followUp({
        content: `❌ Declined by ${interaction.user}. Sender <@${fromUserId}> has been notified.`,
      });
    }
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
