import mongoose from 'mongoose';

const globalLogChannelSchema = new mongoose.Schema({
  _id: { type: String, default: 'singleton' },
  channelId: { type: String, required: true },
  guildId: { type: String, required: true },
  setBy: { type: String },
  setAt: { type: Date, default: Date.now },
});

export default mongoose.model('GlobalLogChannel', globalLogChannelSchema);
