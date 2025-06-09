const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },  // 头像 URL，可为空
  sessionId: { type: mongoose.Schema.Types.ObjectId, default: null },  // 新增 sessionId 字段，用来存储会话标识符
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);

