import mongoose from 'mongoose';

const allowedUserSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  command: { type: String, required: true },
  grantedBy: { type: String },
  grantedAt: { type: Date, default: Date.now },
});

allowedUserSchema.index({ guildId: 1, userId: 1, command: 1 }, { unique: true });

export default mongoose.model('AllowedUser', allowedUserSchema);
