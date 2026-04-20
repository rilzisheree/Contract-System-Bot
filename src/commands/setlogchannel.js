import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import GlobalLogChannel from '../models/GlobalLogChannel.js';
import { hasPermission } from '../lib/permissions.js';
import { sendGlobalLog, logEmbed, setCachedLogChannel, clearCachedLogChannel } from '../lib/logger.js';

export const data = new SlashCommandBuilder()
  .setName('setlogchannel')
  .setDescription('Set, remove, or check the global log channel')
  .addSubcommand(sub =>
    sub.setName('setglobal')
      .setDescription('Set the global log channel (logs from ALL servers)')
      .addChannelOption(opt =>
        opt.setName('channel')
          .setDescription('Channel to use as global log (defaults to current)')
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('Remove the global log channel')
  )
  .addSubcommand(sub =>
    sub.setName('check')
      .setDescription('Check what the current global log channel is')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'setlogchannel');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('❌ You do not have permission to use `/setlogchannel`.')],
      ephemeral: true,
    });
  }

  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  if (sub === 'setglobal') {
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    await GlobalLogChannel.findByIdAndUpdate(
      'singleton',
      {
        channelId: channel.id,
        guildId: interaction.guildId,
        setBy: interaction.user.tag,
        setAt: new Date(),
      },
      { upsert: true, new: true }
    );

    setCachedLogChannel(channel.id, interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor(0x111111)
      .setTitle('✅ Global Log Channel Set')
      .setDescription(`All global logs from every server will now be sent to ${channel}.`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    await sendGlobalLog(interaction.client, logEmbed(
      '📋 Global Log Channel Updated',
      `**${interaction.user.tag}** set global log channel to <#${channel.id}> in **${interaction.guild.name}**`,
      0x111111
    ));

  } else if (sub === 'remove') {
    const deleted = await GlobalLogChannel.findByIdAndDelete('singleton');
    if (!deleted) {
      return interaction.editReply({ content: 'ℹ️ No global log channel was set.' });
    }
    clearCachedLogChannel();
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x111111)
        .setDescription('✅ Global log channel has been removed.')
        .setTimestamp()]
    });

  } else if (sub === 'check') {
    const record = await GlobalLogChannel.findById('singleton');
    if (!record) {
      return interaction.editReply({ content: 'ℹ️ No global log channel is currently set.' });
    }
    const embed = new EmbedBuilder()
      .setColor(0x111111)
      .setTitle('📋 Global Log Channel')
      .setDescription(`Current global log channel: <#${record.channelId}>`)
      .addFields(
        { name: 'Guild ID', value: record.guildId, inline: true },
        { name: 'Set By', value: record.setBy || 'Unknown', inline: true },
        { name: 'Set At', value: `<t:${Math.floor(new Date(record.setAt).getTime() / 1000)}:R>`, inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
}
