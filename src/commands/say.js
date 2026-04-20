import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { hasPermission } from '../lib/permissions.js';
import { sendGlobalLog, logEmbed } from '../lib/logger.js';

export const data = new SlashCommandBuilder()
  .setName('say')
  .setDescription('Send a message as the bot')
  .addStringOption(opt =>
    opt.setName('message')
      .setDescription('The message to send')
      .setRequired(true)
  )
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Channel to send the message in (defaults to current)')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('reply_to')
      .setDescription('Message ID to reply to')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('edit_id')
      .setDescription('Message ID of a bot message to edit')
      .setRequired(false)
  );

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'say');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('❌ You do not have permission to use `/say`.')],
      ephemeral: true,
    });
  }

  const message = interaction.options.getString('message');
  const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
  const replyToId = interaction.options.getString('reply_to');
  const editId = interaction.options.getString('edit_id');

  await interaction.deferReply({ ephemeral: true });

  try {
    if (editId) {
      const msg = await targetChannel.messages.fetch(editId);
      if (msg.author.id !== interaction.client.user.id) {
        return interaction.editReply({ content: '❌ That message was not sent by the bot.' });
      }
      await msg.edit(message);
      await interaction.editReply({ content: `✅ Message edited in ${targetChannel}.` });
    } else if (replyToId) {
      const replyTarget = await targetChannel.messages.fetch(replyToId);
      await replyTarget.reply(message);
      await interaction.editReply({ content: `✅ Replied to message in ${targetChannel}.` });
    } else {
      await targetChannel.send(message);
      await interaction.editReply({ content: `✅ Message sent in ${targetChannel}.` });
    }

    await sendGlobalLog(interaction.client, logEmbed(
      '💬 Say Command',
      `**${interaction.user.tag}** used /say in **${interaction.guild.name}**`,
      0x111111,
      [
        { name: 'Channel', value: `<#${targetChannel.id}>`, inline: true },
        { name: 'Message', value: message.slice(0, 200), inline: false },
      ]
    ));
  } catch (err) {
    await interaction.editReply({ content: `❌ Error: ${err.message}` });
  }
}
