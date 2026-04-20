import AllowedUser from '../models/AllowedUser.js';
import { OWNER_IDS } from '../config.js';

export function isOwner(userId) {
  return OWNER_IDS.includes(userId);
}

export async function hasPermission(interaction, commandName) {
  if (isOwner(interaction.user.id)) return true;

  const record = await AllowedUser.findOne({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    command: commandName,
  }).lean();

  return !!record;
}
