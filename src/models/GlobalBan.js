import mongoose from 'mongoose';

const globalBanSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String },
  reason: { type: String, default: 'No reason provided' },
  bannedBy: { type: String },
  bannedAt: { type: Date, default: Date.now },
});

export default mongoose.model('GlobalBan', globalBanSchema);
