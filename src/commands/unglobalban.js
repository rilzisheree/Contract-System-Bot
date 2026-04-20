import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import GlobalBan from '../models/GlobalBan.js';
import { hasPermission } from '../lib/permissions.js';
import { sendGlobalLog, logEmbed } from '../lib/logger.js';

export const data = new SlashCommandBuilder()
  .setName('unglobalban')
  .setDescription('Remove a global ban from a user')
  .addStringOption(opt =>
    opt.setName('user_id')
      .setDescription('User ID to unban globally')
      .setRequired(true)
  );

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'unglobalban');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('❌ You do not have permission to use `/unglobalban`.')],
      ephemeral: true,
    });
  }

  const userId = interaction.options.getString('user_id');
  await interaction.deferReply({ ephemeral: true });

  const ban = await GlobalBan.findOneAndDelete({ userId });
  if (!ban) {
    return interaction.editReply({ content: `❌ No global ban found for user ID \`${userId}\`.` });
  }

  let unbanned = 0;
  let failed = 0;
  for (const guild of interaction.client.guilds.cache.values()) {
    try {
      await guild.bans.remove(userId, `GlobalBan removed by ${interaction.user.tag}`);
      unbanned++;
    } catch {
      failed++;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Global Ban Removed')
    .setColor(0x111111)
    .setDescription(`Global ban removed for **${ban.username || userId}**.`)
    .addFields(
      { name: 'Unbanned in', value: `${unbanned} server(s)`, inline: true },
      { name: 'Failed', value: `${failed} server(s)`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  await sendGlobalLog(interaction.client, logEmbed(
    '✅ Global Unban',
    `**${interaction.user.tag}** removed global ban for **${ban.username || userId}** (\`${userId}\`)`,
    0x111111
  ));
}
