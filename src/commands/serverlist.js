import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { hasPermission } from '../lib/permissions.js';
import { sendGlobalLog, logEmbed } from '../lib/logger.js';

export const data = new SlashCommandBuilder()
  .setName('serverlist')
  .setDescription('List all servers the bot is in')
  .addStringOption(opt =>
    opt.setName('action')
      .setDescription('Additional action')
      .setRequired(false)
      .addChoices(
        { name: 'leave', value: 'leave' },
        { name: 'invite', value: 'invite' }
      )
  )
  .addStringOption(opt =>
    opt.setName('guild_id')
      .setDescription('Guild ID for leave/invite action')
      .setRequired(false)
  );

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'serverlist');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('❌ You do not have permission to use `/serverlist`.')],
      ephemeral: true,
    });
  }

  const action = interaction.options.getString('action');
  const guildId = interaction.options.getString('guild_id');

  await interaction.deferReply({ ephemeral: true });

  if (action === 'leave' && guildId) {
    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) return interaction.editReply({ content: '❌ Guild not found.' });
    const name = guild.name;
    await guild.leave();
    await sendGlobalLog(interaction.client, logEmbed('🚪 Left Server', `Bot left **${name}** (\`${guildId}\`) by **${interaction.user.tag}**`, 0x111111));
    return interaction.editReply({ content: `✅ Left **${name}**.` });
  }

  if (action === 'invite' && guildId) {
    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) return interaction.editReply({ content: '❌ Guild not found.' });
    const channels = guild.channels.cache.filter(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite'));
    const ch = channels.first();
    if (!ch) return interaction.editReply({ content: '❌ Cannot create invite — no accessible channel.' });
    const invite = await ch.createInvite({ maxAge: 0, maxUses: 1, reason: `Requested by ${interaction.user.tag}` });
    return interaction.editReply({ content: `✅ Invite for **${guild.name}**: ${invite.url}` });
  }

  const guilds = interaction.client.guilds.cache;
  const guildArray = [...guilds.values()];
  const chunkSize = 10;
  const pages = [];

  for (let i = 0; i < guildArray.length; i += chunkSize) {
    const chunk = guildArray.slice(i, i + chunkSize);
    const embed = new EmbedBuilder()
      .setTitle(`📋 Server List (${guilds.size} total) — Page ${Math.floor(i / chunkSize) + 1}`)
      .setColor(0x111111)
      .setDescription(chunk.map((g, idx) =>
        `**${i + idx + 1}.** ${g.name}\n┗ ID: \`${g.id}\` • Members: ${g.memberCount}`
      ).join('\n\n'))
      .setTimestamp();
    pages.push(embed);
  }

  await interaction.editReply({
    embeds: [pages[0]],
    content: pages.length > 1 ? `Page 1 of ${pages.length}` : undefined,
  });

  await sendGlobalLog(interaction.client, logEmbed('📋 Server List', `**${interaction.user.tag}** viewed the server list`, 0x111111));
}
