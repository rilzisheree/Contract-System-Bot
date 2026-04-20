import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import GlobalBan from '../models/GlobalBan.js';
import { hasPermission } from '../lib/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('globalbanlist')
  .setDescription('View the list of globally banned users')
  .addStringOption(opt =>
    opt.setName('action')
      .setDescription('Action to perform')
      .setRequired(false)
      .addChoices(
        { name: 'list', value: 'list' },
        { name: 'remove', value: 'remove' }
      )
  )
  .addStringOption(opt =>
    opt.setName('user_id')
      .setDescription('User ID to remove from global ban list (use with action:remove)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'globalbanlist');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('❌ You do not have permission to use `/globalbanlist`.')],
      ephemeral: true,
    });
  }

  const action = interaction.options.getString('action') || 'list';
  const userId = interaction.options.getString('user_id');

  await interaction.deferReply({ ephemeral: true });

  if (action === 'remove' && userId) {
    const ban = await GlobalBan.findOneAndDelete({ userId });
    if (!ban) return interaction.editReply({ content: `❌ No global ban found for \`${userId}\`.` });

    let unbanned = 0;
    for (const guild of interaction.client.guilds.cache.values()) {
      try { await guild.bans.remove(userId); unbanned++; } catch {}
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x111111)
        .setTitle('✅ Removed from Global Ban List')
        .setDescription(`**${ban.username || userId}** removed and unbanned in ${unbanned} server(s).`)
        .setTimestamp()]
    });
  }

  const bans = await GlobalBan.find().sort({ bannedAt: -1 }).lean();

  if (bans.length === 0) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('✅ No users are globally banned.')]
    });
  }

  const chunkSize = 10;
  const embeds = [];
  for (let i = 0; i < bans.length; i += chunkSize) {
    const chunk = bans.slice(i, i + chunkSize);
    const embed = new EmbedBuilder()
      .setTitle(`🔨 Global Ban List — Page ${Math.floor(i / chunkSize) + 1} (${bans.length} total)`)
      .setColor(0x000000)
      .setDescription(
        chunk.map((b, idx) =>
          `**${i + idx + 1}.** ${b.username || 'Unknown'} (\`${b.userId}\`)\n` +
          `┣ **Reason:** ${b.reason}\n` +
          `┣ **Banned by:** ${b.bannedBy || 'Unknown'}\n` +
          `┗ **Date:** <t:${Math.floor(new Date(b.bannedAt).getTime() / 1000)}:R>`
        ).join('\n\n')
      )
      .setTimestamp();
    embeds.push(embed);
  }

  await interaction.editReply({
    embeds: [embeds[0]],
    content: embeds.length > 1 ? `Page 1 of ${embeds.length}. Use \`action:remove\` + \`user_id\` to remove.` : undefined,
  });
}
