const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const BOT_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_CHANNEL_ID = process.env.DISCORD_ADMIN_CHANNEL_ID;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: ["CHANNEL"],
});

// Pending admin approvals: requestId -> { fromUserId, toUserId, message }
const pendingRequests = new Map();

// ─── Register slash command on ready ─────────────────────────────────────────

client.once("ready", async () => {
  console.log(`Bot is online as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: [
        new SlashCommandBuilder()
          .setName("sendtext")
          .setDescription("Send a text message to another player.")
          .toJSON(),
      ],
    });
    console.log("Slash command /sendtext registered globally.");
  } catch (err) {
    console.error("Failed to register slash command:", err);
  }
});

// ─── Interaction handler ──────────────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {

  // ── /sendtext → open modal ────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === "sendtext") {
    const modal = new ModalBuilder()
      .setCustomId("sendtext_modal")
      .setTitle("Send a Text Message");

    const recipientInput = new TextInputBuilder()
      .setCustomId("recipient_id")
      .setLabel("Which contact do you send a text to?")
      .setPlaceholder("Send their Discord ID")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const messageInput = new TextInputBuilder()
      .setCustomId("message_content")
      .setLabel("What does your text say?")
      .setPlaceholder("Text | Lore Name | Discord Username")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(recipientInput),
      new ActionRowBuilder().addComponents(messageInput)
    );

    return interaction.showModal(modal);
  }

  // ── Modal submission ──────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "sendtext_modal") {
    const recipientId = interaction.fields.getTextInputValue("recipient_id").trim();
    const messageContent = interaction.fields.getTextInputValue("message_content").trim();

    // Validate Discord ID format
    if (!/^\d{17,19}$/.test(recipientId)) {
      return interaction.reply({
        content: "That doesn't look like a valid Discord ID. Please try `/sendtext` again.",
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: "Sending...",
      ephemeral: true,
    });

    const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (!adminChannel) {
      return interaction.editReply({
        content: "Could not reach the admin channel. Please contact an admin.",
      });
    }

    const requestId = `${interaction.user.id}-${Date.now()}`;
    pendingRequests.set(requestId, {
      fromUserId: interaction.user.id,
      toUserId: recipientId,
      message: messageContent,
    });

    const embed = new EmbedBuilder()
      .setTitle("📱 Incoming Text — Pending Approval")
      .setColor(0xf0a500)
      .addFields(
        { name: "From", value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
        { name: "To", value: `<@${recipientId}> (\`${recipientId}\`)`, inline: true },
        { name: "Message", value: messageContent }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve:${requestId}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`decline:${requestId}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌")
    );

    await adminChannel.send({ embeds: [embed], components: [row] });
  }

  // ── Approve / Decline buttons ─────────────────────────────────────────────
  if (interaction.isButton()) {
    const colonIndex = interaction.customId.indexOf(":");
    if (colonIndex === -1) return;

    const action = interaction.customId.slice(0, colonIndex);
    const requestId = interaction.customId.slice(colonIndex + 1);

    if (!["approve", "decline"].includes(action)) return;

    const request = pendingRequests.get(requestId);
    if (!request) {
      return interaction.reply({
        content: "This request has already been handled or has expired.",
        ephemeral: true,
      });
    }

    pendingRequests.delete(requestId);
    const { fromUserId, toUserId, message } = request;

    // Disabled button row for after a decision
    const doneRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("done_approve")
        .setLabel("Approved")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅")
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("done_decline")
        .setLabel("Declined")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌")
        .setDisabled(true)
    );

    if (action === "approve") {
      // DM the recipient
      let deliveryFailed = false;
      try {
        const recipient = await client.users.fetch(toUserId);
        await recipient.send(`A message is sent to your phone\n\n- ${message}`);
      } catch {
        deliveryFailed = true;
      }

      // Notify the sender
      try {
        const sender = await client.users.fetch(fromUserId);
        await sender.send(
          deliveryFailed
            ? "Your signal seems to be off, the text doesn't send."
            : "Text Message Sent."
        );
      } catch {
        // Sender has DMs closed, nothing we can do
      }

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x2ecc71)
        .setTitle("📱 Text Message Approved — Sent");

      await interaction.update({ embeds: [updatedEmbed], components: [doneRow] });

      await interaction.followUp({
        content: deliveryFailed
          ? `⚠️ Approved by ${interaction.user}, but <@${toUserId}> has DMs closed — delivery failed.`
          : `✅ Approved by ${interaction.user}. Message delivered to <@${toUserId}>.`,
      });
    }

    if (action === "decline") {
      // Notify the sender
      try {
        const sender = await client.users.fetch(fromUserId);
        await sender.send("Your signal seems to be off, the text doesn't send.");
      } catch {
        // Sender has DMs closed
      }

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0xe74c3c)
        .setTitle("📱 Text Message Declined — Not Sent");

      await interaction.update({ embeds: [updatedEmbed], components: [doneRow] });

      await interaction.followUp({
        content: `❌ Declined by ${interaction.user}. Sender <@${fromUserId}> has been notified.`,
      });
    }
  }
});

client.login(BOT_TOKEN);
