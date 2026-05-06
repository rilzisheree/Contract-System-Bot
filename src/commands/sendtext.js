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
  try {
  const modal = new ModalBuilder()
    .setCustomId('sendtext_modal')
    .setTitle('Send a Text Message');

  const recipientInput = new TextInputBuilder()
    .setCustomId('recipient_id')
    .setLabel('Which contact do you send a text to?')
    .setPlaceholder('Send their Discord ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const loreNameInput = new TextInputBuilder()
    .setCustomId('lore_name')
    .setLabel('Lore Name')
    .setPlaceholder("You don't need to add a lore name, it'll show as (Unknown)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const messageInput = new TextInputBuilder()
    .setCustomId('message_content')
    .setLabel('What does your text say?')
    .setPlaceholder('Text')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(recipientInput),
    new ActionRowBuilder().addComponents(loreNameInput),
    new ActionRowBuilder().addComponents(messageInput)
  );

  await interaction.showModal(modal);
  } catch (err) {
    console.error('[sendtext] Failed to show modal:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Something went wrong. Please try again.', ephemeral: true }).catch(() => {});
    }
  }
}
