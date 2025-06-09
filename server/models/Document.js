const mongoose = require('mongoose');

const EditHistorySchema = new mongoose.Schema({
  editor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  editedAt: Date,
  contentSnapshot: { type: Object, default: {} }, // 存 Delta
  ySnapshot: { type: Array, default: undefined }, // 新增，存 Uint8Array 转数组
});

const DocumentSchema = new mongoose.Schema({
  title: String,
  content: { type: Object, default: {} }, // 存 Delta
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  documentCollUser: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  editors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  editHistory: [EditHistorySchema],
  lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastEditedAt: Date,
  joinLink: { type: String, unique: true },
  format: { type: String, default: 'docx' }
});

module.exports = mongoose.model('Document', DocumentSchema);
