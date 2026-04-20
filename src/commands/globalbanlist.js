import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ComponentType,
} from 'discord.js';
import GlobalBan from '../models/GlobalBan.js';
import { hasPermission } from '../lib/permissions.js';
import { sendGlobalLog, logEmbed } from '../lib/logger.js';

export const data = new SlashCommandBuilder()
  .setName('globalbanlist')
  .setDescription('View and manage globally banned users');

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'globalbanlist');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('❌ You do not have permission to use `/globalbanlist`.')],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const bans = await GlobalBan.find().sort({ bannedAt: -1 }).lean();

  if (bans.length === 0) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('✅ No users are globally banned.')],
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`🔨 Global Ban List (${bans.length} total)`)
    .setColor(0x000000)
    .setDescription(
      bans.slice(0, 10).map((b, idx) =>
        `**${idx + 1}.** ${b.username || 'Unknown'} (\`${b.userId}\`)\n` +
        `┣ **Reason:** ${b.reason}\n` +
        `┣ **Banned by:** ${b.bannedBy || 'Unknown'}\n` +
        `┗ **Date:** <t:${Math.floor(new Date(b.bannedAt).getTime() / 1000)}:R>`
      ).join('\n\n') +
      (bans.length > 10 ? `\n\n*...and ${bans.length - 10} more*` : '')
    )
    .setTimestamp();

  const selectOptions = bans.slice(0, 25).map(b => ({
    label: (b.username || 'Unknown').slice(0, 100),
    description: `Reason: ${b.reason.slice(0, 50)}`,
    value: b.userId,
  }));

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('globalban_select')
      .setPlaceholder('Select a user to unban...')
      .addOptions(selectOptions)
  );

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('globalban_unban')
      .setLabel('Unban Selected')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );

  await interaction.editReply({ embeds: [embed], components: [selectRow, buttonRow] });

  let selectedUserId = null;

  const collector = interaction.channel.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 120_000,
  });

  collector.on('collect', async i => {
    if (i.customId === 'globalban_select') {
      selectedUserId = i.values[0];
      const selected = bans.find(b => b.userId === selectedUserId);

      const updatedButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('globalban_unban')
          .setLabel(`Unban ${selected?.username || selectedUserId}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(false)
      );

      await i.update({ components: [selectRow, updatedButton] });

    } else if (i.customId === 'globalban_unban' && selectedUserId) {
      const ban = await GlobalBan.findOneAndDelete({ userId: selectedUserId });
      if (!ban) return i.update({ content: '❌ Ban not found.', components: [] });

      let unbanned = 0;
      for (const guild of interaction.client.guilds.cache.values()) {
        try { await guild.bans.remove(selectedUserId, `GlobalBan removed by ${interaction.user.tag}`); unbanned++; } catch {}
      }

      collector.stop();

      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(0x111111)
          .setTitle('✅ Global Ban Removed')
          .setDescription(`**${ban.username || selectedUserId}** has been unbanned from ${unbanned} server(s).`)
          .setTimestamp()],
        components: [],
      });

      await sendGlobalLog(interaction.client, logEmbed(
        '✅ Global Unban',
        `**${interaction.user.tag}** removed global ban for **${ban.username || selectedUserId}** (\`${selectedUserId}\`)`,
        0x111111
      ));
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      interaction.editReply({ components: [] }).catch(() => {});
    }
  });
}
