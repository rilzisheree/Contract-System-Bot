import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ComponentType,
} from 'discord.js';
import { hasPermission } from '../lib/permissions.js';
import { sendGlobalLog, logEmbed } from '../lib/logger.js';

export const data = new SlashCommandBuilder()
  .setName('serverlist')
  .setDescription('List all servers the bot is in');

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'serverlist');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('❌ You do not have permission to use `/serverlist`.')],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const guilds = [...interaction.client.guilds.cache.values()];

  const embed = new EmbedBuilder()
    .setTitle(`📋 Server List (${guilds.length} total)`)
    .setColor(0x111111)
    .setDescription(
      guilds.slice(0, 10).map((g, idx) =>
        `**${idx + 1}.** ${g.name}\n┗ ID: \`${g.id}\` • Members: ${g.memberCount}`
      ).join('\n\n') +
      (guilds.length > 10 ? `\n\n*...and ${guilds.length - 10} more*` : '')
    )
    .setTimestamp();

  const selectOptions = guilds.slice(0, 25).map(g => ({
    label: g.name.slice(0, 100),
    description: `${g.memberCount} members · ID: ${g.id}`,
    value: g.id,
  }));

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('serverlist_select')
      .setPlaceholder('Select a server...')
      .addOptions(selectOptions)
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('serverlist_invite')
      .setLabel('Get Invite')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('serverlist_leave')
      .setLabel('Leave Server')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );

  await interaction.editReply({ embeds: [embed], components: [selectRow, actionRow] });

  let selectedGuildId = null;

  const collector = interaction.channel.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 120_000,
  });

  collector.on('collect', async i => {
    if (i.customId === 'serverlist_select') {
      selectedGuildId = i.values[0];
      const guild = interaction.client.guilds.cache.get(selectedGuildId);

      const updatedActions = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('serverlist_invite')
          .setLabel(`Get Invite — ${guild?.name || selectedGuildId}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId('serverlist_leave')
          .setLabel(`Leave — ${guild?.name || selectedGuildId}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(false)
      );

      await i.update({ components: [selectRow, updatedActions] });

    } else if (i.customId === 'serverlist_invite' && selectedGuildId) {
      const guild = interaction.client.guilds.cache.get(selectedGuildId);
      if (!guild) return i.update({ content: '❌ Guild not found.', components: [] });

      const channels = guild.channels.cache.filter(c =>
        c.isTextBased() && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite')
      );
      const ch = channels.first();
      if (!ch) return i.reply({ content: '❌ Cannot create invite — no accessible channel.', ephemeral: true });

      const invite = await ch.createInvite({ maxAge: 0, maxUses: 1, reason: `Requested by ${interaction.user.tag}` });
      await i.reply({ content: `✅ Invite for **${guild.name}**: ${invite.url}`, ephemeral: true });

    } else if (i.customId === 'serverlist_leave' && selectedGuildId) {
      const guild = interaction.client.guilds.cache.get(selectedGuildId);
      if (!guild) return i.update({ content: '❌ Guild not found.', components: [] });

      const name = guild.name;
      await guild.leave();
      collector.stop();

      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(0x111111)
          .setDescription(`✅ Left **${name}**.`)
          .setTimestamp()],
        components: [],
      });

      await sendGlobalLog(interaction.client, logEmbed(
        '🚪 Left Server',
        `Bot left **${name}** (\`${selectedGuildId}\`) by **${interaction.user.tag}**`,
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
