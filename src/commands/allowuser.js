import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import AllowedUser from '../models/AllowedUser.js';
import { hasPermission } from '../lib/permissions.js';

const COMMANDS = ['purge', 'say', 'serverlist', 'globalban', 'unglobalban', 'globalbanlist', 'setlogchannel', 'dm', 'allowuser'];

export const data = new SlashCommandBuilder()
  .setName('allowuser')
  .setDescription('Manage user permissions for specific commands')
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Give a user permission to use a command')
      .addUserOption(opt =>
        opt.setName('user').setDescription('User to allow').setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('command').setDescription('Command name to allow').setRequired(true)
          .addChoices(...COMMANDS.map(c => ({ name: c, value: c })))
      )
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription("Remove a user's permission to use a command")
      .addUserOption(opt =>
        opt.setName('user').setDescription('User to remove').setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('command').setDescription('Command name').setRequired(true)
          .addChoices(...COMMANDS.map(c => ({ name: c, value: c })))
      )
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('List all allowed users and their permitted commands')
  );

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'allowuser');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x111111).setDescription('❌ You do not have permission to use `/allowuser`.')],
      ephemeral: true,
    });
  }

  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  if (sub === 'add') {
    const target = interaction.options.getUser('user');
    const command = interaction.options.getString('command');

    const existing = await AllowedUser.findOne({
      guildId: interaction.guildId,
      userId: target.id,
      command,
    });

    if (existing) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x111111)
          .setDescription(`ℹ️ **${target.tag}** already has permission to use \`/${command}\`.`)]
      });
    }

    await AllowedUser.create({
      guildId: interaction.guildId,
      userId: target.id,
      command,
      grantedBy: interaction.user.tag,
      grantedAt: new Date(),
    });

    const embed = new EmbedBuilder()
      .setColor(0x111111)
      .setTitle('✅ Permission Granted')
      .setDescription(`**${target.tag}** can now use \`/${command}\`.`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === 'remove') {
    const target = interaction.options.getUser('user');
    const command = interaction.options.getString('command');

    const deleted = await AllowedUser.findOneAndDelete({
      guildId: interaction.guildId,
      userId: target.id,
      command,
    });

    if (!deleted) {
      return interaction.editReply({
        content: `ℹ️ **${target.tag}** didn't have permission for \`/${command}\`.`
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x111111)
      .setTitle('✅ Permission Removed')
      .setDescription(`**${target.tag}** can no longer use \`/${command}\`.`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === 'list') {
    const records = await AllowedUser.find({ guildId: interaction.guildId })
      .sort({ userId: 1, command: 1 })
      .lean();

    if (records.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x111111)
          .setDescription('ℹ️ No custom permissions are set in this server.')]
      });
    }

    const grouped = {};
    for (const r of records) {
      if (!grouped[r.userId]) grouped[r.userId] = [];
      grouped[r.userId].push(r.command);
    }

    const embed = new EmbedBuilder()
      .setColor(0x111111)
      .setTitle('📋 Allowed Users')
      .setDescription(
        Object.entries(grouped)
          .map(([uid, cmds]) => `<@${uid}>\n┗ Commands: ${cmds.map(c => `\`/${c}\``).join(', ')}`)
          .join('\n\n')
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}
