import React, { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import 'quill/dist/quill.snow.css';
import { QuillBinding } from 'y-quill';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client'; // 新增
import { Modal, Select, Button, message, Drawer, Radio, Input } from 'antd'; // 替换 Modal, Select
import { ExclamationCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import './word-page.css';
import { List, Tooltip } from 'antd';
import { HistoryOutlined, RollbackOutlined, DiffOutlined } from '@ant-design/icons';
import DiffMatchPatch from 'diff-match-patch';

// 获取内容
function getPlainTextFromDelta(delta: any) {
  if (!delta) return '';
  if (typeof delta === 'string') return delta;
  // 兼容直接是 Delta 数组的情况
  if (Array.isArray(delta)) {
    return delta.map((op: any) => typeof op.insert === 'string' ? op.insert : '').join('');
  }
  if (Array.isArray(delta.ops)) {
    return delta.ops.map((op: any) => typeof op.insert === 'string' ? op.insert : '').join('');
  }
  return '';
}

// 生成高亮 diff HTML
function getDiffHtml(oldText: string, nowText: string) {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldText, nowText);
  dmp.diff_cleanupSemantic(diffs);
  return diffs.map(([op, data], i) => {
    if (op === DiffMatchPatch.DIFF_INSERT) {
      return <span key={i} style={{ background: '#d4fcdc', color: '#388e3c' }}>{data}</span>;
    }
    if (op === DiffMatchPatch.DIFF_DELETE) {
      return <span key={i} style={{ background: '#ffecec', color: '#d32f2f', textDecoration: 'line-through' }}>{data}</span>;
    }
    return <span key={i}>{data}</span>;
  });
}

// 字号样式支持
const fontSizeStyle = Quill.import('attributors/style/size');
fontSizeStyle.whitelist = [
  '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px',
];
Quill.register(fontSizeStyle, true);
Quill.register('modules/cursors', QuillCursors);

const toolbarOptions = {
  container: [
    [{ header: [1, 2, 3, 4, 5, 6, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
    [{ script: 'sub' }, { script: 'super' }],
    [{ align: [] }],
    [{ indent: '-1' }, { indent: '+1' }],
    [{ direction: 'rtl' }],
    [{ color: [] }, { background: [] }],
    ['link', 'image', 'video', 'formula'],
    ['clean'],
  ],
};

const wsUrl = 'ws://localhost:1234';
const socketUrl = 'http://localhost:4000'; // Socket.IO 服务地址

const getColorByUserId = (userId: string) => {
  const colors = [
    '#1abc9c', '#2ecc71', '#3498db', '#9b59b6',
    '#16a085', '#27ae60', '#2980b9', '#8e44ad',
    '#f1c40f', '#e67e22', '#e74c3c', '#ecf0f1',
    '#95a5a6', '#f39c12', '#d35400', '#c0392b',
    '#bdc3c7', '#7f8c8d', '#ff69b4', '#ff9800',
    '#00bcd4', '#8bc34a', '#ff5722', '#3f51b5'
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const DocumentEditor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const bindingRef = useRef<QuillBinding | null>(null);

  // 新增
  const socketRef = useRef<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; username: string; color: string }[]>([]);
  const [docTitle, setDocTitle] = useState('文档');

  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [cursorColor, setCursorColor] = useState('#1abc9c');
  const [saving, setSaving] = useState(false);

  const [docInfo, setDocInfo] = useState<any>(null); // 保存完整文档信息
  const [showPermModal, setShowPermModal] = useState(false);
  const [showPermDrawer, setShowPermDrawer] = useState(false);
  const [editors, setEditors] = useState<string[]>([]);
  const [viewers, setViewers] = useState<string[]>([]);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [userPermMap, setUserPermMap] = useState<Record<string, 'edit' | 'view'>>({});
  const [isViewer, setIsViewer] = useState(false);

  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [compareContent, setCompareContent] = useState<{old?: any, now?: any} | null>(null);


  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(docTitle);

  // 获取用户和文档信息
  useEffect(() => {
    const fetchUserAndDoc = async () => {
      const token = localStorage.getItem('token');
      if (!token) return navigate('/login');
      try {
        const [userRes, docRes] = await Promise.all([
          axios.get('http://localhost:4000/me', {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`http://localhost:4000/documents/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        setUserId(userRes.data._id);
        setUsername(userRes.data.username);
        setCursorColor(getColorByUserId(userRes.data._id));
        setDocTitle(docRes.data.title || '文档');
      } catch {
        navigate('/login');
      }
    };
    if (id) fetchUserAndDoc();
  }, [navigate, id]);

  // 拉取文档详情（含协作者和权限）
  useEffect(() => {
    const fetchDocInfo = async () => {
      const token = localStorage.getItem('token');
      if (!token || !id) return;
      try {
        const res = await axios.get(`http://localhost:4000/documents/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDocInfo(res.data);
        setEditors(res.data.editors?.map((u: any) => u._id) || []);
        setViewers(res.data.viewers?.map((u: any) => u._id) || []);
        setCollaborators(res.data.documentCollUser || []);
        // 判断是否为viewer
        const isOwner = res.data.owner && res.data.owner._id === userId;
        const isEditor = res.data.editors?.some((u: any) => u._id === userId || u === userId);
        const isViewerNow = !isOwner && !isEditor && res.data.viewers?.some((u: any) => u._id === userId || u === userId);
        setIsViewer(isViewerNow);
        // 初始化权限映射
        const map: Record<string, 'edit' | 'view'> = {};
        (res.data.documentCollUser || []).forEach((u: any) => {
          if (res.data.owner && u._id === res.data.owner._id) return;
          if (res.data.editors?.some((e: any) => (e._id || e) === u._id)) map[u._id] = 'edit';
          else map[u._id] = 'view';
        });
        setUserPermMap(map);
      } catch (e) {}
    };
    fetchDocInfo();
  }, [id, userId]);

  // Socket.IO 用户列表同步
  useEffect(() => {
    if (!id || !userId || !username) return;
    const socket = io(socketUrl, { transports: ['websocket'] });
    socketRef.current = socket;

    // 加入文档房间，带 color
    socket.emit('joinDoc', { docId: id, userId, username, color: cursorColor });

    // 监听在线用户
    socket.on('onlineUsers', (users: { userId: string; username: string; color: string }[]) => {
      setOnlineUsers(users);
      // 如果自己在列表里，自动同步 color
      const me = users.find(u => u.userId === userId);
      if (me && me.color !== cursorColor) {
        setCursorColor(me.color);
      }
    });

    // 新增：监听权限变更
    socket.on('permissionUpdated', ({ docId }) => {
      if (docId === id) {
        message.info('文档权限已变更，请刷新页面或重新进入。');
        // 也可以自动刷新权限信息
        const token = localStorage.getItem('token');
        if (token) {
          axios.get(`http://localhost:4000/documents/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          }).then(res => {
            setDocInfo(res.data);
            setEditors(res.data.editors?.map((u: any) => u._id) || []);
            setViewers(res.data.viewers?.map((u: any) => u._id) || []);
            setCollaborators(res.data.documentCollUser || []);
            // 重新构建权限映射
            const map: Record<string, 'edit' | 'view'> = {};
            (res.data.documentCollUser || []).forEach((u: any) => {
              if (res.data.owner && u._id === res.data.owner._id) return;
              if (res.data.editors?.some((e: any) => (e._id || e) === u._id)) map[u._id] = 'edit';
              else map[u._id] = 'view';
            });
            setUserPermMap(map);
          });
        }
      }
    });

    // 离开房间/断开
    return () => {
      socket.emit('leaveDoc', { docId: id, userId });
      socket.disconnect();
    };
  }, [id, userId, username]);
  // Yjs 文档和 WebSocket 协同
  useEffect(() => {
    if (!editorRef.current || !id || !userId || !username) return;

    editorRef.current.innerHTML = '';

    // Yjs 文档和 WebSocket 协同
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const provider = new WebsocketProvider(wsUrl, `doc-${id}`, ydoc);
    providerRef.current = provider;

    provider.awareness.setLocalStateField('user', {
      name: username,
      color: cursorColor
    });

    // 只读模式
    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder: '请输入内容',
      modules: {
        toolbar: isViewer ? false : { container: '#toolbar' },
        cursors: true,
        history: { userOnly: true }
      },
      readOnly: isViewer
    });
    quillRef.current = quill;

    // 绑定 Yjs 和 Quill
    const ytext = ydoc.getText('quill');
    provider.on('sync', async (isSynced: boolean) => {
      if (isSynced && ytext.toString().length === 0) {
        const token = localStorage.getItem('token');
        try {
          const res = await axios.get(`http://localhost:4000/documents/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const dbContent = res.data.content;
          if (dbContent) {
            ytext.applyDelta(dbContent.ops || []);
          }
        } catch (e) {}
      }
    });

    const binding = new QuillBinding(ytext, quill, provider.awareness);
    bindingRef.current = binding;

    quill.on('selection-change', (range) => {
      if (range) {
        provider.awareness.setLocalStateField('selection', {
          index: range.index,
          length: range.length,
        });
      } else {
        provider.awareness.setLocalStateField('selection', null);
      }
    });

    // 动态设置协同光标颜色变量
    const setCursorColors = () => {
      const cursors = editorRef.current?.querySelectorAll('.ql-cursor') || [];
      cursors.forEach(cursor => {
        const caret = cursor.querySelector('.ql-cursor-caret') as HTMLElement | null;
        const flag = cursor.querySelector('.ql-cursor-flag') as HTMLElement | null;
        let color = '';
        if (caret && caret.style.backgroundColor) {
          color = caret.style.backgroundColor;
        } else if (flag && flag.style.backgroundColor) {
          color = flag.style.backgroundColor;
        } else if (cursor.hasAttribute('data-color')) {
          color = (cursor as HTMLElement).getAttribute('data-color') || '';
        }
        if (caret && color) {
          caret.style.setProperty('--cursor-color', color);
        }
      });
    };
    const observer = new MutationObserver(setCursorColors);
    const cursorsRoot = editorRef.current.querySelector('.ql-cursors');
    if (cursorsRoot) {
      observer.observe(cursorsRoot, { childList: true, subtree: true, attributes: true });
    }
    setTimeout(setCursorColors, 300);

    return () => {
      provider.destroy();
      ydoc.destroy();
      binding.destroy();
      observer.disconnect();
    };
  }, [id, userId, username, isViewer]); 

  // 修改颜色时，通知服务器
  const handleColorChange = (color: string) => {
    setCursorColor(color);
    providerRef.current?.awareness.setLocalStateField('user', {
      name: username,
      color: color
    });
    // 通知服务器同步颜色
    if (socketRef.current) {
      socketRef.current.emit('updateColor', { docId: id, userId, color });
    }
  };

  // 监听 cursorColor 变化，awareness 也同步
  useEffect(() => {
    if (providerRef.current && username) {
      providerRef.current.awareness.setLocalStateField('user', {
        name: username,
        color: cursorColor
      });
    }
  }, [cursorColor, username]);

  const handleSave = async () => {
    if (!id || !ydocRef.current) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const ytext = ydocRef.current.getText('quill');
      const delta = ytext.toDelta();
      await axios.put(
        `http://localhost:4000/documents/${id}`,
        { content: delta },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('保存成功');
    } catch (e) {
      alert('保存失败');
    }
    setSaving(false);
  };

  // 获取历史版本
  const fetchHistory = async () => {
    const token = localStorage.getItem('token');
    if (!token || !id) return;
    try {
      const res = await axios.get(`http://localhost:4000/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistoryList(res.data.editHistory?.slice().reverse() || []);
    } catch {}
  };

  // 打开历史版本侧边栏
  const openHistoryDrawer = async () => {
    await fetchHistory();
    setShowHistoryDrawer(true);
  };

  // 回滚到某个历史版本（只前端回滚，不保存）
  const handleRollback = (item: any) => {
    Modal.confirm({
      title: '确定回滚到该历史版本',
      icon: <ExclamationCircleOutlined />,
      okText: '回滚',
      okType: 'danger',
      cancelText: '取消',
      onOk() {
        // 只前端回滚
        if (quillRef.current && item.contentSnapshot) {
          quillRef.current.setContents(item.contentSnapshot);
          message.success('已回滚到该版本');
          setShowHistoryDrawer(false);
        }
      }
    });
  };

  // 对比历史版本
  const handleCompare = (item: any) => {
    if (!quillRef.current) return;
    const now = quillRef.current.getContents();
    setCompareContent({ old: item.contentSnapshot, now });
  };

  // 关闭对比弹窗
  const closeCompare = () => setCompareContent(null);


  // 批量设置所有人权限
  const setAllPerm = (perm: 'edit' | 'view') => {
    const newMap = { ...userPermMap };
    collaborators.forEach((u: any) => {
      if (docInfo && docInfo.owner && u._id === docInfo.owner._id) return;
      newMap[u._id] = perm;
    });
    setUserPermMap(newMap);
  };

  // 单人权限切换
  const handlePermChange = (userId: string, perm: 'edit' | 'view') => {
    setUserPermMap(prev => ({ ...prev, [userId]: perm }));
  };

  // 权限保存
  const handleSavePermission = async () => {
    const editors = Object.entries(userPermMap)
      .filter(([_, v]) => v === 'edit')
      .map(([k]) => k);
    const viewers = Object.entries(userPermMap)
      .filter(([_, v]) => v === 'view')
      .map(([k]) => k);
    const token = localStorage.getItem('token');
    if (!token || !id) return;
    try {
      await axios.put(
        `http://localhost:4000/documents/${id}/permission`,
        { editors, viewers },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('权限已更新');
      setShowPermDrawer(false);
      // 重新拉取文档信息
      const res = await axios.get(`http://localhost:4000/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocInfo(res.data);
      setEditors(res.data.editors?.map((u: any) => u._id) || []);
      setViewers(res.data.viewers?.map((u: any) => u._id) || []);
      setCollaborators(res.data.documentCollUser || []);
      // 计算变更用户
      const changed: string[] = [];
      (res.data.documentCollUser || []).forEach((u: any) => {
        if (res.data.owner && u._id === res.data.owner._id) return;
        const oldPerm = userPermMap[u._id];
        const newPerm = editors.includes(u._id) ? 'edit' : 'view';
        if (oldPerm !== newPerm) changed.push(u.username);
      });
      if (changed.length) {
        message.info(`以下用户权限已变更：${changed.join('、')}`);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || '权限更新失败');
    }
  };

  // 移除协作者
  const handleRemoveCollaborator = (userId: string, username: string) => {
    Modal.confirm({
      title: `确定要移除协作者「${username}」吗？`,
      icon: <ExclamationCircleOutlined />,
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const token = localStorage.getItem('token');
        if (!token || !id) return;
        try {
          await axios.post(
            `http://localhost:4000/documents/${id}/remove-collaborator`,
            { userId },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          message.success(`已移除协作者「${username}」`);
          // 重新拉取文档信息
          const res = await axios.get(`http://localhost:4000/documents/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setDocInfo(res.data);
          setEditors(res.data.editors?.map((u: any) => u._id) || []);
          setViewers(res.data.viewers?.map((u: any) => u._id) || []);
          setCollaborators(res.data.documentCollUser || []);
          // 移除权限映射
          setUserPermMap(prev => {
            const newMap = { ...prev };
            delete newMap[userId];
            return newMap;
          });
        } catch (e: any) {
          message.error(e?.response?.data?.message || '移除失败');
        }
      }
    });
  };

  // 标题输入框同步 docTitle
  useEffect(() => {
    setTitleInput(docTitle);
  }, [docTitle]);

  // 标题保存
  const handleTitleSave = async () => {
    if (!id || !titleInput.trim() || titleInput === docTitle) {
      setEditingTitle(false);
      setTitleInput(docTitle);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `http://localhost:4000/documents/${id}`,
        { title: titleInput.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDocTitle(titleInput.trim());
      setEditingTitle(false);
      // 通知其他人（socket.io 监听 permissionUpdated 或自定义事件都可，这里复用 permissionUpdated）
      if (socketRef.current) {
        socketRef.current.emit('titleUpdated', { docId: id, title: titleInput.trim() });
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || '标题修改失败');
      setTitleInput(docTitle);
      setEditingTitle(false);
    }
  };

  // 监听 socket 标题变更
  useEffect(() => {
    if (!socketRef.current) return;
    const socket = socketRef.current;
    const handler = ({ docId: eventDocId, title }: { docId: string; title: string }) => {
      if (eventDocId === id && title) {
        setDocTitle(title);
      }
    };
    socket.on('titleUpdated', handler);
    return () => {
      socket.off('titleUpdated', handler);
    };
  }, [id]);

  return (
    <div>
      {/* 第一排：居中对称，左侧本人+光标颜色，右侧在线用户 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: 1100,
          margin: '24px auto 0 auto',
          padding: '0 8px',
          minHeight: 48,
        }}
      >
        {/* 左侧本人+光标颜色 */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 28, // 间隔更大
          fontSize: 18,
          fontWeight: 500,
        }}>
          <span>本人：</span>
          <span
            style={{
              display: 'inline-block',
              background: cursorColor,
              color: '#fff',
              borderRadius: 4,
              padding: '2px 14px',
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: 1,
              marginRight: 8, // 颜色块和下一个元素间距
            }}
          >
            {username}
          </span>
          <span style={{ marginLeft: 12, marginRight: 4 }}>光标颜色：</span>
          <input
            type="color"
            value={cursorColor}
            onChange={e => handleColorChange(e.target.value)}
            style={{
              width: 28,
              height: 28,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              verticalAlign: 'middle',
              marginRight: 18, // 颜色选择和在线用户间距
            }}
          />
        </div>
        {/* 右侧在线用户 */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 18, // 间隔更大
          fontSize: 16,
          fontWeight: 500,
        }}>
          <span style={{ fontWeight: 600 }}>在线用户：</span>
          {onlineUsers.map(u => (
            <span
              key={u.userId}
              style={{
                display: 'inline-block',
                background: u.color || getColorByUserId(u.userId),
                color: '#fff',
                borderRadius: 4,
                padding: '2px 14px',
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: 1,
                marginRight: 6, // 颜色块和下一个用户间距
              }}
            >
              {u.username}
            </span>
          ))}
        </div>
      </div>

      {/* 第二排：左侧图标+标题，右侧按钮 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          maxWidth: 1100,
          margin: '10px auto 0 auto',
          padding: '0 8px',
          minHeight: 60,
          borderBottom: '2px solid #f0f0f0',
        }}
      >
        {/* 左侧图标+标题 */}
        <div
          style={{
            flex: 1,
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            minHeight: 48,
            gap: 16,
          }}
        >
          {/* 文档图标或首字母圆形 */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#1677ff22',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
              fontSize: 26,
              fontWeight: 700,
              color: '#1677ff',
              boxShadow: '0 2px 8px #e3e3e3',
              userSelect: 'none',
            }}
          >
            <span role="img" aria-label="doc" style={{ fontSize: 26 }}>
              📄
            </span>
          </div>
          {/* 标题 */}
          {docInfo && docInfo.owner && userId === docInfo.owner._id ? (
            editingTitle ? (
              <Input
                value={titleInput}
                autoFocus
                onChange={e => setTitleInput(e.target.value)}
                onBlur={handleTitleSave}
                onPressEnter={handleTitleSave}
                maxLength={50}
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  width: 320,
                  marginRight: 8,
                  background: '#f8f8f8',
                  border: '1.5px solid #1677ff',
                  borderRadius: 6,
                  padding: '2px 16px',
                }}
              />
            ) : (
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  color: '#222',
                  textShadow: '0 2px 8px #e3e3e3',
                  letterSpacing: 2,
                  lineHeight: 1.2,
                  verticalAlign: 'bottom',
                  cursor: 'pointer',
                  marginRight: 8,
                }}
                title="点击修改标题"
                onClick={() => setEditingTitle(true)}
              >
                {docTitle}
              </span>
            )
          ) : (
            <span
              style={{
                fontSize: 34,
                fontWeight: 800,
                color: '#222',
                textShadow: '0 2px 8px #e3e3e3',
                letterSpacing: 2,
                lineHeight: 1.2,
                verticalAlign: 'bottom',
                marginRight: 8,
              }}
            >
              {docTitle}
            </span>
          )}
          {isViewer && (
            <span style={{ color: '#faad14', fontSize: 18, marginLeft: 18, fontWeight: 500 }}>只读模式</span>
          )}
        </div>
        {/* 右侧按钮（更小一点） */}
        <div style={{ display: 'flex', gap: 10 }}>
          {docInfo && docInfo.owner && userId === docInfo.owner._id && (
            <Button
              size="middle"
              style={{
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 15,
                padding: '0 18px',
                height: 36,
                background: '#f5f5f5',
                border: '1.5px solid #1677ff',
                color: '#1677ff',
              }}
              onClick={() => setShowPermDrawer(true)}
            >
              权限管理
            </Button>
          )}
          {/* 历史版本按钮 */}
          <Button
            size="middle"
            icon={<HistoryOutlined />}
            style={{
              borderRadius: 6,
              fontWeight: 500,
              fontSize: 15,
              padding: '0 18px',
              height: 36,
              background: '#f5f5f5',
              border: '1.5px solid #aaa',
              color: '#333',
            }}
            onClick={openHistoryDrawer}
          >
            历史版本
          </Button>
          {!isViewer && (
            <Button
              type="primary"
              size="middle"
              style={{
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 15,
                padding: '0 18px',
                height: 36,
              }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存'}
            </Button>
          )}
        </div>
      </div>

      {/* 第三排：富文本工具栏单独一行 */}
      {!isViewer && (
        <div
          id="toolbar"
          style={{
            margin: '18px auto 10px auto',
            maxWidth: 794,
            border: '1px solid #ddd',
            borderRadius: 6,
            background: '#fff',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 48,
          }}
        >
          <select className="ql-header" defaultValue="">
            <option value="">正文</option>
            <option value="1">标题1</option>
            <option value="2">标题2</option>
            <option value="3">标题3</option>
            <option value="4">标题4</option>
            <option value="5">标题5</option>
            <option value="6">标题6</option>
          </select>
          <button className="ql-bold" />
          <button className="ql-italic" />
          <button className="ql-underline" />
          <button className="ql-strike" />
          <button className="ql-blockquote" />
          <button className="ql-code-block" />
          <button className="ql-list" value="ordered" />
          <button className="ql-list" value="bullet" />
          <button className="ql-list" value="check" />
          <button className="ql-script" value="sub" />
          <button className="ql-script" value="super" />
          <button className="ql-align" value="" />
          <button className="ql-align" value="center" />
          <button className="ql-align" value="right" />
          <button className="ql-align" value="justify" />
          <button className="ql-indent" value="-1" />
          <button className="ql-indent" value="+1" />
          <button className="ql-direction" value="rtl" />
          <select className="ql-size" defaultValue="16px">
            <option value="12px">12px</option>
            <option value="14px">14px</option>
            <option value="16px">16px</option>
            <option value="18px">18px</option>
            <option value="20px">20px</option>
            <option value="24px">24px</option>
            <option value="28px">28px</option>
            <option value="32px">32px</option>
            <option value="36px">36px</option>
          </select>
          <select className="ql-color" />
          <select className="ql-background" />
          <button className="ql-link" />
          <button className="ql-image" />
          <button className="ql-video" />
          <button className="ql-formula" />
          <button className="ql-clean" />
        </div>
      )}

      {/* Word页面样式包裹 */}
      <div className="word-page-wrap">
        <div className="word-page">
          <div ref={editorRef} />
        </div>
      </div>

      {/* 权限管理侧边栏 */}
      <Drawer
        title="权限管理"
        placement="right"
        width={400}
        open={showPermDrawer}
        onClose={() => setShowPermDrawer(false)}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => setShowPermDrawer(false)} style={{ marginRight: 8 }}>取消</Button>
            <Button type="primary" onClick={handleSavePermission}>保存</Button>
          </div>
        }
      >
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <Button onClick={() => setAllPerm('edit')}>所有人可编辑</Button>
          <Button onClick={() => setAllPerm('view')}>所有人可查看</Button>
        </div>
        <div>
          {collaborators.map((u: any) => (
            <div key={u._id} style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ flex: 1 }}>
                {u.username}
                {docInfo && docInfo.owner && u._id === docInfo.owner._id && (
                  <span style={{ color: '#1677ff', marginLeft: 8 }}>（拥有者）</span>
                )}
              </span>
              {docInfo && docInfo.owner && u._id === docInfo.owner._id ? (
                <span style={{ color: '#888', fontSize: 13 }}>拥有所有权限</span>
              ) : (
                <>
                  <Radio.Group
                    value={userPermMap[u._id]}
                    onChange={e => handlePermChange(u._id, e.target.value)}
                    buttonStyle="solid"
                    size="small"
                    style={{ marginRight: 8 }}
                  >
                    <Radio.Button value="edit">可编辑</Radio.Button>
                    <Radio.Button value="view">可查看</Radio.Button>
                  </Radio.Group>
                  <Button
                    type="link"
                    icon={<DeleteOutlined />}
                    danger
                    size="small"
                    onClick={() => handleRemoveCollaborator(u._id, u.username)}
                  >
                    移除
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, color: '#888', fontSize: 13 }}>
          只能设置为协作者范围内的用户。拥有者默认拥有所有权限。
        </div>
      </Drawer>
      <Drawer
        title="历史版本"
        placement="right"
        width={500}
        open={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
      >
        <List
          dataSource={historyList}
          renderItem={item => (
            <List.Item
              actions={[
                <Tooltip title="对比当前内容">
                  <Button
                    icon={<DiffOutlined />}
                    size="small"
                    onClick={() => handleCompare(item)}
                  />
                </Tooltip>,
                <Tooltip title="回滚到此版本">
                  <Button
                    icon={<RollbackOutlined />}
                    size="small"
                    danger
                    onClick={() => handleRollback(item)}
                  />
                </Tooltip>
              ]}
            >
              <List.Item.Meta
                title={
                  <span>
                    {item.editor?.username || '未知用户'}
                    <span style={{ color: '#888', marginLeft: 12, fontSize: 13 }}>
                      {item.editedAt ? new Date(item.editedAt).toLocaleString() : ''}
                    </span>
                  </span>
                }
                description={
                  <span style={{ color: '#888', fontSize: 13 }}>
                    {getPlainTextFromDelta(item.contentSnapshot).slice(0, 30) || '[无内容]'}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>
      <Modal
        open={!!compareContent}
        title="历史版本对比"
        onCancel={closeCompare}
        footer={null}
        width={800}
      >
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>历史版本</div>
            <pre style={{ background: '#f6f6f6', padding: 8, minHeight: 120, whiteSpace: 'pre-wrap' }}>
              {getPlainTextFromDelta(compareContent?.old)}
            </pre>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>当前内容</div>
            <pre style={{ background: '#f6f6f6', padding: 8, minHeight: 120, whiteSpace: 'pre-wrap' }}>
              {getDiffHtml(
                getPlainTextFromDelta(compareContent?.old),
                getPlainTextFromDelta(compareContent?.now)
              )}
            </pre>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DocumentEditor;