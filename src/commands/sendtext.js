import {
  SlashCommandBuilder,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('sendtext')
  .setDescription('Send a text message to another player.');

export async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('sendtext_modal')
    .setTitle('Send a Text Message');

  const recipientInput = new TextInputBuilder()
    .setCustomId('recipient_id')
    .setLabel('Which contact do you send a text to?')
    .setPlaceholder('Send their Discord ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const messageInput = new TextInputBuilder()
    .setCustomId('message_content')
    .setLabel('What does your text say?')
    .setPlaceholder('Text | Lore Name |')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(recipientInput),
    new ActionRowBuilder().addComponents(messageInput)
  );

  await interaction.showModal(modal);
