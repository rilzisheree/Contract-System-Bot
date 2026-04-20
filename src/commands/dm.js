import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { hasPermission } from '../lib/permissions.js';
import { sendGlobalLog, logEmbed } from '../lib/logger.js';

export const data = new SlashCommandBuilder()
  .setName('dm')
  .setDescription('Send a direct message to a user from the bot')
  .addUserOption(opt =>
    opt.setName('user')
      .setDescription('User to DM')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('message')
      .setDescription('Message to send')
      .setRequired(true)
  );

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'dm');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('❌ You do not have permission to use `/dm`.')],
      ephemeral: true,
    });
  }

  const target = interaction.options.getUser('user');
  const message = interaction.options.getString('message');

  await interaction.deferReply({ ephemeral: true });

  try {
    await target.send(message);

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x111111)
        .setTitle('✅ DM Sent')
        .setDescription(`Message sent to **${target.tag}**.`)
        .setTimestamp()]
    });

    await sendGlobalLog(interaction.client, logEmbed(
      '📩 DM Sent',
      `**${interaction.user.tag}** sent a DM to **${target.tag}** (\`${target.id}\`) from **${interaction.guild.name}**`,
      0x111111,
      [{ name: 'Message', value: message.slice(0, 300) }]
    ));
  } catch {
    await interaction.editReply({ content: `❌ Could not DM **${target.tag}** — they may have DMs disabled.` });
  }
}
