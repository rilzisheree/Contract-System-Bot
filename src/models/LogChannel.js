import mongoose from 'mongoose';

const logChannelSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  isGlobal: { type: Boolean, default: false },
});

export default mongoose.model('LogChannel', logChannelSchema);
