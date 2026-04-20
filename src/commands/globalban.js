import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import GlobalBan from '../models/GlobalBan.js';
import { hasPermission } from '../lib/permissions.js';
import { sendGlobalLog, logEmbed } from '../lib/logger.js';

export const data = new SlashCommandBuilder()
  .setName('globalban')
  .setDescription('Globally ban a user from all servers the bot is in')
  .addUserOption(opt =>
    opt.setName('user')
      .setDescription('User to globally ban')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('reason')
      .setDescription('Reason for the global ban')
      .setRequired(false)
  );

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'globalban');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('❌ You do not have permission to use `/globalban`.')],
      ephemeral: true,
    });
  }

  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  await interaction.deferReply({ ephemeral: true });

  await GlobalBan.findOneAndUpdate(
    { userId: target.id },
    { userId: target.id, username: target.tag, reason, bannedBy: interaction.user.tag, bannedAt: new Date() },
    { upsert: true, new: true }
  );

  try {
    await target.send(
      `**You've been __BANNED__ from all Contract servers.**\n\n` +
      `Reason: **"${reason}"**\n\n` +
      `To apply: `
    );
  } catch {
    // DMs disabled or bot shares no server with user — silent fail
  }

  let banned = 0;
  let failed = 0;
  for (const guild of interaction.client.guilds.cache.values()) {
    try {
      await guild.bans.create(target.id, { reason: `[Auto Global Ban from Contract Admin Bot] ${reason} | By: ${interaction.user.tag}` });
      banned++;
    } catch {
      failed++;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('🔨 Global Ban Applied')
    .setColor(0x000000)
    .setDescription(`**${target.tag}** has been globally banned.`)
    .addFields(
      { name: 'Reason', value: reason },
      { name: 'Banned in', value: `${banned} server(s)`, inline: true },
      { name: 'Failed', value: `${failed} server(s)`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  await sendGlobalLog(interaction.client, logEmbed(
    '🔨 Global Ban',
    `**${interaction.user.tag}** globally banned **${target.tag}** (\`${target.id}\`)`,
    0x000000,
    [{ name: 'Reason', value: reason }, { name: 'Servers', value: `${banned} banned, ${failed} failed` }]
  ));
}
