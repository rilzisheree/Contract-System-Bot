import { EmbedBuilder } from 'discord.js';
import GlobalLogChannel from '../models/GlobalLogChannel.js';

let _cachedLogChannelId = null;
let _cachedLogGuildId = null;

export function setCachedLogChannel(channelId, guildId) {
  _cachedLogChannelId = channelId;
  _cachedLogGuildId = guildId;
}

export function clearCachedLogChannel() {
  _cachedLogChannelId = null;
  _cachedLogGuildId = null;
}

export function getCachedLogChannelId() {
  return _cachedLogChannelId;
}

export async function initLogChannelCache() {
  try {
    const record = await GlobalLogChannel.findById('singleton');
    if (record) {
      _cachedLogChannelId = record.channelId;
      _cachedLogGuildId = record.guildId;
    }
  } catch (err) {
    console.error('Failed to init log channel cache:', err);
  }
}

export async function sendGlobalLog(client, embed) {
  if (!_cachedLogChannelId || !_cachedLogGuildId) return;
  try {
    const guild = client.guilds.cache.get(_cachedLogGuildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(_cachedLogChannelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Failed to send global log:', err);
  }
}

export function logEmbed(title, description, color = 0x111111, fields = []) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
  if (fields.length) embed.addFields(fields);
  return embed;
}
