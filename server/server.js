const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');

dotenv.config();

const app = express();

const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});


app.use(cors());
app.use(express.json());

// === 连接数据库（带重试）===
const connectWithRetry = () => {
  console.log('Connecting to MongoDB...');
  mongoose.connect(process.env.DB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
      console.error('MongoDB connection error:', err);
      console.log('Retrying in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    });
};
connectWithRetry();

// === 模型定义 ===
const User = require('./models/User');
const Document = require('./models/Document');

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to DB');
});
mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// 登录接口
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password are required' });

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    // 生成新的会话 ID
    const sessionId = new mongoose.Types.ObjectId();  // 使用 ObjectId 生成唯一会话标识符

    // 更新用户的 sessionId
    user.sessionId = sessionId;
    await user.save();

    // 生成 JWT Token，并包含 sessionId
    const token = jwt.sign({ userId: user._id, sessionId }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// JWT 验证中间件：验证 sessionId 是否匹配
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' });

    const user = await User.findById(decoded.userId);
    if (!user || user.sessionId.toString() !== decoded.sessionId.toString()) {
      return res.status(401).json({ message: 'Session expired or invalid' });
    }

    req.userId = decoded.userId;
    next();
  });
};


// === 用户注册 ===
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password are required' });

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    // 新增：注册时生成 sessionId
    const sessionId = new mongoose.Types.ObjectId();
    const user = new User({ username, password: hashedPassword, sessionId });
    await user.save();

    // 生成 token 时带 sessionId
    const token = jwt.sign({ userId: user._id, sessionId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ token });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});


// === 获取当前用户信息 ===
app.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// === 修改用户名和头像 ===
app.put('/me', verifyToken, async (req, res) => {
  const { username, avatar } = req.body;
  try {
    if (username) {
      const existingUser = await User.findOne({ username });
      if (existingUser && existingUser._id.toString() !== req.userId) {
        return res.status(400).json({ message: 'Username already taken' });
      }
    }
    const user = await User.findByIdAndUpdate(req.userId, { username, avatar }, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// === 修改密码 ===
app.put('/me/password', verifyToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ message: 'Old and new passwords are required' });

  try {
    const user = await User.findById(req.userId);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Old password incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// 创建文档
app.post('/documents', verifyToken, async (req, res) => {
  const { title, format = 'docx' } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ message: 'Document title is required and must be a non-empty string' });
  }
  try {
    const { nanoid } = await import('nanoid');
    let joinLink;
    let exists = true;
    while (exists) {
      
      joinLink = nanoid(12);
      exists = await Document.exists({ joinLink });
    }
    const document = new Document({
      title: title.trim(),
      format,
      owner: req.userId,
      joinLink,
      documentCollUser: [req.userId], // 拥有者为第一个协作者
    });
    const savedDoc = await document.save();
    res.status(201).json(savedDoc);
  } catch (error) {
    res.status(500).json({ message: 'Server error while creating document', error: error.message });
  }
});

// 用户通过 joinLink 加入文档
app.post('/documents/join', verifyToken, async (req, res) => {
  const { joinLink } = req.body;
  if (!joinLink) return res.status(400).json({ message: '缺少文档链接' });

  const doc = await Document.findOne({ joinLink });
  if (!doc) return res.status(404).json({ message: '文档不存在' });

  // 已经是协作者则无需重复加入
  if (doc.documentCollUser.some(id => id.toString() === req.userId)) {
    return res.json({ message: '已加入', doc });
  }

  doc.documentCollUser.push(req.userId);
  // 默认加入 editors，可编辑
  if (!doc.editors.some(id => id.toString() === req.userId)) {
    doc.editors.push(req.userId);
  }
  await doc.save();
  res.json({ message: '加入成功', doc });
});

// === 获取用户相关文档===
app.get('/documents', verifyToken, async (req, res) => {
  try {
    const docs = await Document.find({
      documentCollUser: req.userId
    })
      .populate('owner', 'username avatar')
      .populate('editors', 'username')   // 加上这行
      .populate('viewers', 'username');  // 加上这行
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching documents', error: err.message });
  }
});

//权限设置
app.put('/documents/:id/permission', verifyToken, async (req, res) => {
  const { editors, viewers } = req.body;
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  if (doc.owner.toString() !== req.userId) return res.status(403).json({ message: 'Only owner can set permission' });

  // 只允许设置为 documentCollUser 范围内的用户
  const collUserIds = doc.documentCollUser.map(id => id.toString());

  doc.editors = editors.filter(id => collUserIds.includes(id));
  doc.viewers = viewers.filter(id => collUserIds.includes(id));

  await doc.save();
  io.to(doc._id.toString()).emit('permissionUpdated', { docId: doc._id });
  res.json({ message: 'Permission updated' });
});

// 移除协作者（仅 owner 可操作）
app.post('/documents/:id/remove-collaborator', verifyToken, async (req, res) => {
  const { userId } = req.body;
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  if (doc.owner.toString() !== req.userId) return res.status(403).json({ message: 'Only owner can remove collaborator' });
  if (userId === doc.owner.toString()) return res.status(400).json({ message: 'Cannot remove owner' });

  // 从协作者、编辑者、查看者中移除
  doc.documentCollUser = doc.documentCollUser.filter(id => id.toString() !== userId);
  doc.editors = doc.editors.filter(id => id.toString() !== userId);
  doc.viewers = doc.viewers.filter(id => id.toString() !== userId);

  await doc.save();
  res.json({ message: 'Collaborator removed' });
});


// === 获取指定文档 ===
app.get('/documents/:id', verifyToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('owner', 'username avatar')
      .populate('editors', 'username avatar')
      .populate('viewers', 'username avatar')
      .populate('documentCollUser', 'username') // 只返回用户名
      .populate('editHistory.editor', 'username avatar');
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    // 权限判断
    const isOwner = doc.owner._id.toString() === req.userId;
    const isEditor = Array.isArray(doc.editors) && doc.editors.some(e => (e._id || e).toString() === req.userId);
    const isViewer = Array.isArray(doc.viewers) && doc.viewers.some(v => (v._id || v).toString() === req.userId);

    if (!(isOwner || isEditor || isViewer)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching document', error: err.message });
  }
});

// === 更新文档内容（保存编辑）===
app.put('/documents/:id', verifyToken, async (req, res) => {
  const { content, title, ySnapshot } = req.body; // 新增 ySnapshot
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    // 权限判断
    const isOwner = doc.owner.toString() === req.userId;
    const isEditor = Array.isArray(doc.editors) && doc.editors.some(id => id.toString() === req.userId);

    // 允许拥有者修改标题，编辑者只能改内容
    if (title !== undefined) {
      if (!isOwner) return res.status(403).json({ message: 'Only owner can change title' });
      if (!title.trim()) return res.status(400).json({ message: 'Title cannot be empty' });
      doc.title = title.trim();
    }

    if (content !== undefined) {
      if (!(isOwner || isEditor)) {
        return res.status(403).json({ message: 'No permission to edit' });
      }
      // 追加版本历史，存 ySnapshot
      doc.editHistory.push({
        editor: req.userId,
        editedAt: new Date(),
        contentSnapshot: content,
        ySnapshot: ySnapshot || undefined // 新增
      });
      doc.content = content;
      doc.lastEditedBy = req.userId;
      doc.lastEditedAt = new Date();
    }

    await doc.save();

    io.to(doc._id.toString()).emit('historyUpdated');
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'Error updating document', error: err.message });
  }
});

// === 删除文档 ===
app.delete('/documents/:id', verifyToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    // 只有 owner 可以删除
    if (doc.owner.toString() !== req.userId) {
      return res.status(403).json({ message: 'Only owner can delete the document' });
    }

    // 从MongoDB删除
    await Document.deleteOne({ _id: req.params.id });
    
    // 通知所有在线用户
    io.to(doc._id.toString()).emit('documentDeleted');
    
    res.json({ message: 'Document deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting document', error: err.message });
  }
});

// 设置 multer 存储配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');  // 上传文件保存目录
  },
  filename: (req, file, cb) => {
    // 用时间戳和原文件名防止冲突
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ storage });

// 静态托管 uploads 目录，方便浏览器访问
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 新增头像上传接口
app.post('/upload-avatar', verifyToken, upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  // 返回头像可访问的URL
  const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: avatarUrl });
});

// 新增图片上传接口
const imageUpload = multer({ dest: 'uploads/' });
app.post('/upload-image', verifyToken, imageUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url });
});

app.get('/users', verifyToken, async (req, res) => {
  const users = await User.find({}, 'username _id');
  res.json(users);
});

// 在线用户列表存储
const onlineUsersMap = {}; // { docId: [{ userId, username, socketId }] }

io.on('connection', (socket) => {
  // 加入文档房间
  socket.on('joinDoc', ({ docId, userId, username, color }) => {
    socket.join(docId);
    console.log(`[joinDoc] user:${userId} socket:${socket.id} join docId:${docId}`);
    if (!onlineUsersMap[docId]) onlineUsersMap[docId] = [];
    // 避免重复
    if (!onlineUsersMap[docId].some(u => u.userId === userId)) {
      onlineUsersMap[docId].push({ userId, username, color, socketId: socket.id });
    }
    io.to(docId).emit('onlineUsers', onlineUsersMap[docId].map(u => ({
      userId: u.userId,
      username: u.username,
      color: u.color
    })));
  });

  // 离开文档房间
  socket.on('leaveDoc', ({ docId, userId }) => {
    if (onlineUsersMap[docId]) {
      onlineUsersMap[docId] = onlineUsersMap[docId].filter(u => u.userId !== userId);
      io.to(docId).emit('onlineUsers', onlineUsersMap[docId].map(u => ({
        userId: u.userId,
        username: u.username,
        color: u.color
      })));
    }
    socket.leave(docId);
  });

  // 新增：处理颜色变更
  socket.on('updateColor', ({ docId, userId, color }) => {
    if (onlineUsersMap[docId]) {
      onlineUsersMap[docId] = onlineUsersMap[docId].map(u =>
        u.userId === userId ? { ...u, color } : u
      );
      io.to(docId).emit('onlineUsers', onlineUsersMap[docId].map(u => ({
        userId: u.userId,
        username: u.username,
        color: u.color
      })));
    }
  });
  // 新增：文档标题修改事件转发
  socket.on('titleUpdated', ({ docId, title }) => {
    io.to(docId).emit('titleUpdated', { docId, title });
  });

  // 断开连接时自动移除
  socket.on('disconnect', () => {
    for (const docId in onlineUsersMap) {
      const before = onlineUsersMap[docId].length;
      onlineUsersMap[docId] = onlineUsersMap[docId].filter(u => u.socketId !== socket.id);
      if (onlineUsersMap[docId].length !== before) {
        io.to(docId).emit('onlineUsers', onlineUsersMap[docId].map(u => ({
          userId: u.userId,
          username: u.username,
          color: u.color
        })));
      }
    }
  });
});

// === 服务器启动 ===
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server + Socket.IO running at http://localhost:${PORT}`);
});