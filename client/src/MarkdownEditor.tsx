import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { io, Socket } from 'socket.io-client';
import { Button, Drawer, Modal, Input, message, List, Tooltip, Radio } from 'antd';
import { HistoryOutlined, DiffOutlined, RollbackOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css'; // 或其它 highlight.js 主题
import axios from 'axios';
import DiffMatchPatch from 'diff-match-patch';
import { DownOutlined, /* 其它图标 */ } from '@ant-design/icons';
import { Dropdown, Menu } from 'antd';
const wsUrl = 'ws://localhost:1234';
const socketUrl = 'http://localhost:4000';

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

function diffCharsHtml(oldText: string, newText: string) {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);
  let html = '';
  for (const [op, data] of diffs) {
    if (op === DiffMatchPatch.DIFF_INSERT) {
      html += `<span style="background:#d4fcdc;color:#388e3c;">${data}</span>`;
    } else if (op === DiffMatchPatch.DIFF_DELETE) {
      html += `<span style="background:#ffeaea;color:#e74c3c;text-decoration:line-through;">${data}</span>`;
    } else {
      html += data;
    }
  }
  return html;
}
function trimLineEnd(str: string) {
  return (str || '').replace(/[\n\r\s]+$/, '');
}

const MarkdownEditor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [markdown, setMarkdown] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(docTitle);

  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; username: string; color: string }[]>([]);
  const [isViewer, setIsViewer] = useState(false);

  // 权限
  const [docInfo, setDocInfo] = useState<any>(null);
  const [showPermDrawer, setShowPermDrawer] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [userPermMap, setUserPermMap] = useState<Record<string, 'edit' | 'view'>>({});

  // 历史
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [compareContent, setCompareContent] = useState<{ old?: string, now?: string } | null>(null);

  // 评论
  const [comments, setComments] = useState<any[]>([]);
  const [showCommentPanel, setShowCommentPanel] = useState(true);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [commentAnchor, setCommentAnchor] = useState<{ start: number, end: number } | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  // 颜色
  const [cursorColor, setCursorColor] = useState('#1677ff');

  
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
        setDocTitle(docRes.data.title || 'Markdown文档');
        
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
    socket.emit('joinDoc', { docId: id, userId, username });
    socket.on('onlineUsers', (users: { userId: string; username: string; color: string }[]) => {
      setOnlineUsers(users);
    });
    socket.on('updateColor', ({ userId: uid, color }) => {
      setOnlineUsers(users => users.map(u => u.userId === uid ? { ...u, color } : u));
    });
    socket.on('permissionUpdated', ({ docId }) => {
      if (docId === id) {
        message.info('文档权限已变更，请刷新页面或重新进入。');
      }
    });
    return () => {
      socket.emit('leaveDoc', { docId: id, userId });
      socket.disconnect();
    };
  }, [id, userId, username]);

  // Yjs 协同
  useEffect(() => {
    if (!id) return;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const provider = new WebsocketProvider(wsUrl, `md-${id}`, ydoc);
    providerRef.current = provider;
    const ytext = ydoc.getText('markdown');
    setMarkdown(ytext.toString());
    ytext.observe(() => {
      setMarkdown(ytext.toString());
    });
    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [id]);

  // 编辑同步
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMarkdown(val);
    if (ydocRef.current) {
      const ytext = ydocRef.current.getText('markdown');
      ytext.delete(0, ytext.length);
      ytext.insert(0, val);
    }
  };

  // 工具栏插入语法
  const insertSyntax = (syntax: string, surround?: [string, string]) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // 只在插入内容时阻止只读，插入评论不阻止
    if (isViewer && syntax !== 'comment') return;
    const { selectionStart, selectionEnd, value } = textarea;
    let newValue = value;
    if (surround) {
      newValue =
        value.slice(0, selectionStart) +
        surround[0] +
        value.slice(selectionStart, selectionEnd) +
        surround[1] +
        value.slice(selectionEnd);
      setTimeout(() => {
        textarea.setSelectionRange(selectionStart + surround[0].length, selectionEnd + surround[0].length);
      }, 0);
    } else {
      newValue =
        value.slice(0, selectionStart) +
        syntax +
        value.slice(selectionEnd);
      setTimeout(() => {
        textarea.setSelectionRange(selectionStart + syntax.length, selectionStart + syntax.length);
      }, 0);
    }
    setMarkdown(newValue);
    if (ydocRef.current) {
      const ytext = ydocRef.current.getText('markdown');
      ytext.delete(0, ytext.length);
      ytext.insert(0, newValue);
    }
    textarea.focus();
  };

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
      if (socketRef.current) {
        socketRef.current.emit('titleUpdated', { docId: id, title: titleInput.trim() });
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || '标题修改失败');
      setTitleInput(docTitle);
      setEditingTitle(false);
    }
  };

  // 历史版本
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
  const openHistoryDrawer = async () => {
    await fetchHistory();
    setShowHistoryDrawer(true);
  };
  const handleRollback = (item: any) => {
    Modal.confirm({
      title: '确定回滚到该历史版本',
      icon: <ExclamationCircleOutlined />,
      okText: '回滚',
      okType: 'danger',
      cancelText: '取消',
      onOk() {
        if (ydocRef.current && item.contentSnapshot) {
          const ytext = ydocRef.current.getText('markdown');
          ytext.delete(0, ytext.length);
          ytext.insert(0, item.contentSnapshot);
          setShowHistoryDrawer(false);
          message.success('已回滚到该版本');
        }
      }
    });
  };
  const handleCompare = (item: any) => {
    if (!ydocRef.current) return;
    const now = ydocRef.current.getText('markdown').toString();
    setCompareContent({ old: item.contentSnapshot, now });
  };
  const closeCompare = () => setCompareContent(null);

  // 评论相关
  const fetchComments = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token || !id) return;
    const res = await axios.get(`http://localhost:4000/documents/${id}/comments`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setComments(res.data);
  }, [id]);
  useEffect(() => {
    if (showCommentPanel) {
      fetchComments();
    }
  }, [showCommentPanel]);
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.on('commentsUpdated', fetchComments);
    return () => {
      socket.off('commentsUpdated', fetchComments);
    };
  }, [fetchComments, socketRef.current]);

  // 权限管理
  const setAllPerm = (perm: 'edit' | 'view') => {
    const newMap = { ...userPermMap };
    collaborators.forEach((u: any) => {
      if (docInfo && docInfo.owner && u._id === docInfo.owner._id) return;
      newMap[u._id] = perm;
    });
    setUserPermMap(newMap);
  };
  const handlePermChange = (userId: string, perm: 'edit' | 'view') => {
    setUserPermMap(prev => ({ ...prev, [userId]: perm }));
  };
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
      setCollaborators(res.data.documentCollUser || []);
    } catch (e: any) {
      message.error(e?.response?.data?.message || '权限更新失败');
    }
  };
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
          setCollaborators(res.data.documentCollUser || []);
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

  // 评论锚点
  const handleInsertComment = () => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) {
      message.warning('请先选中要评论的内容');
      return;
    }
    setCommentAnchor({ start, end });
    setReplyTo(null);
    setShowCommentModal(true);
  };

  // 保存
  const handleSave = async () => {
    if (!id || !ydocRef.current) return;
    try {
      const token = localStorage.getItem('token');
      const ytext = ydocRef.current.getText('markdown');
      const content = ytext.toString();
      await axios.put(
        `http://localhost:4000/documents/${id}`,
        { content },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('保存成功');
    } catch (e) {
      message.error('保存失败');
    }
  };

  // 颜色变化处理
  const handleColorChange = (color: string) => {
    setCursorColor(color);
    if (socketRef.current) {
      socketRef.current.emit('updateColor', { docId: id, userId, color });
    }
  };

  const color = getColorByUserId(userId);

  return (
    <div style={{ padding: 40 }}>
      {/* 顶部本人+在线用户 */}
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
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 28,
          fontSize: 18,
          fontWeight: 500,
        }}>
          <span>本人：</span>
          <span
            style={{
              display: 'inline-block',
              background: color,
              color: '#fff',
              borderRadius: 4,
              padding: '2px 14px',
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: 1,
              marginRight: 8,
            }}
          >
            {username}
          </span>
        </div>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 18,
          fontSize: 16,
          fontWeight: 500,
        }}>
          <span style={{ fontWeight: 600 }}>在线用户：</span>
          {onlineUsers.map(u => (
            <span
              key={u.userId}
              style={{
                display: 'inline-block',
                background: getColorByUserId(u.userId),
                color: '#fff',
                borderRadius: 4,
                padding: '2px 14px',
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: 1,
                marginRight: 6,
              }}
            >
              {u.username}
            </span>
          ))}
        </div>
      </div>
      {/* 标题栏 */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        maxWidth: 1100, margin: '10px auto 0 auto', padding: '0 8px', minHeight: 60, borderBottom: '2px solid #f0f0f0'
      }}>
        <div style={{ flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', minHeight: 48, gap: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: '#1677ff22',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10,
            fontSize: 26, fontWeight: 700, color: '#1677ff', boxShadow: '0 2px 8px #e3e3e3', userSelect: 'none'
          }}>
            <span role="img" aria-label="md" style={{ fontSize: 26 }}>📝</span>
          </div>
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
                  fontSize: 30, fontWeight: 800, width: 320, marginRight: 8,
                  background: '#f8f8f8', border: '1.5px solid #1677ff', borderRadius: 6, padding: '2px 16px'
                }}
              />
            ) : (
              <span
                style={{
                  fontSize: 34, fontWeight: 800, color: '#222', textShadow: '0 2px 8px #e3e3e3',
                  letterSpacing: 2, lineHeight: 1.2, verticalAlign: 'bottom', cursor: 'pointer', marginRight: 8,
                }}
                title="点击修改标题"
                onClick={() => setEditingTitle(true)}
              >
                {docTitle}
              </span>
            )
          ) : (
            <span style={{
              fontSize: 34, fontWeight: 800, color: '#222', textShadow: '0 2px 8px #e3e3e3',
              letterSpacing: 2, lineHeight: 1.2, verticalAlign: 'bottom', marginRight: 8,
            }}>
              {docTitle}
            </span>
          )}
          {isViewer && (
            <span style={{ color: '#faad14', fontSize: 18, marginLeft: 18, fontWeight: 500 }}>只读模式</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {docInfo && docInfo.owner && userId === docInfo.owner._id && (
            <Button size="middle" style={{
              borderRadius: 6, fontWeight: 500, fontSize: 15, padding: '0 18px', height: 36,
              background: '#f5f5f5', border: '1.5px solid #1677ff', color: '#1677ff',
            }} onClick={() => setShowPermDrawer(true)}>
              权限管理
            </Button>
          )}
          {!isViewer && (
            <>
              <Button size="middle" icon={<HistoryOutlined />} style={{
                borderRadius: 6, fontWeight: 500, fontSize: 15, padding: '0 18px', height: 36,
                background: '#f5f5f5', border: '1.5px solid #aaa', color: '#333',
              }} onClick={openHistoryDrawer}>
                历史版本
              </Button>
              <Button type="primary" size="middle" style={{
                borderRadius: 6, fontWeight: 500, fontSize: 15, padding: '0 18px', height: 36,
              }} onClick={handleSave}>
                保存
              </Button>
            </>
          )}
          <Dropdown
            overlay={
              <Menu>
                <Menu.Item
                  key="md"
                  onClick={() => {
                    // 导出 Markdown
                    const blob = new Blob([markdown], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = (docTitle || '文档') + '.md';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  导出为 Markdown
                </Menu.Item>
                <Menu.Item
                  key="pdf"
                  onClick={async () => {
                    // 导出 PDF
                    const html2pdf = (await import('html2pdf.js')).default;
                    // 给右侧渲染区加 className="markdown-preview-pdf"
                    const preview = document.querySelector('.markdown-preview-pdf') as HTMLElement;
                    if (preview) {
                      // 记录原边框样式
                      const oldBorder = preview.style.border;
                      // 临时去除边框
                      preview.style.border = 'none';
                      html2pdf()
                        .from(preview)
                        .set({
                          margin: 0.5,
                          filename: (docTitle || '文档') + '.pdf',
                          html2canvas: { scale: 2 },
                          jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
                        })
                        .save()
                        .finally(() => {
                          // 恢复原边框
                          preview.style.border = oldBorder;
                        });
                    } else {
                      message.error('未找到可导出的内容');
                    }
                  }}
                >
                  导出为 PDF
                </Menu.Item>
              </Menu>
            }
            placement="bottomRight"
            trigger={['click']}
          >
            <Button
              size="middle"
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
            >
              导出 <DownOutlined />
            </Button>
          </Dropdown>

          <Button size="middle" style={{
            borderRadius: 6, fontWeight: 500, fontSize: 15, padding: '0 18px', height: 36,
            background: showCommentPanel ? '#1677ff' : '#f5f5f5',
            border: '1.5px solid #1677ff',
            color: showCommentPanel ? '#fff' : '#1677ff',
            marginLeft: 0
          }}
            onClick={() => setShowCommentPanel(true)}
            disabled={showCommentPanel}
          >
            评论区
          </Button>
        </div>
      </div>
      {/* Markdown 工具栏 */}
      {!isViewer && (
        <div style={{
          margin: '18px auto 10px auto', maxWidth: 794, border: '1px solid #ddd', borderRadius: 6,
          background: '#fff', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 6
        }}>
          <Tooltip title="加粗"><button onClick={() => insertSyntax('**加粗文字**', ['**', '**'])}><b>B</b></button></Tooltip>
          <Tooltip title="斜体"><button onClick={() => insertSyntax('_斜体_', ['_', '_'])}><i>I</i></button></Tooltip>
          <Tooltip title="删除线"><button onClick={() => insertSyntax('~~删除线~~', ['~~', '~~'])}><s>S</s></button></Tooltip>
          <Tooltip title="标题1"><button onClick={() => insertSyntax('# 标题1\n')}>H1</button></Tooltip>
          <Tooltip title="标题2"><button onClick={() => insertSyntax('## 标题2\n')}>H2</button></Tooltip>
          <Tooltip title="标题3"><button onClick={() => insertSyntax('### 标题3\n')}>H3</button></Tooltip>
          <Tooltip title="无序列表"><button onClick={() => insertSyntax('- 列表项\n')}>•</button></Tooltip>
          <Tooltip title="有序列表"><button onClick={() => insertSyntax('1. 列表项\n')}>1.</button></Tooltip>
          <Tooltip title="引用"><button onClick={() => insertSyntax('> 引用\n')}>“</button></Tooltip>
          <Tooltip title="代码块"><button onClick={() => insertSyntax('```\n代码块\n```\n', ['```\n', '\n```'])}>{'<>'}</button></Tooltip>
          <Tooltip title="行内代码"><button onClick={() => insertSyntax('`代码`', ['`', '`'])}>{'</>'}</button></Tooltip>
          <Tooltip title="插入链接"><button onClick={() => insertSyntax('[链接文本](url)')}>🔗</button></Tooltip>
          <Tooltip title="插入图片"><button onClick={() => insertSyntax('![图片描述](url)')}>🖼️</button></Tooltip>
          <Tooltip title="插入表格"><button onClick={() => insertSyntax('\n| 表头1 | 表头2 |\n| --- | --- |\n| 内容1 | 内容2 |\n')}>表格</button></Tooltip>
          <Tooltip title="插入评论"><button onClick={handleInsertComment}>💬</button></Tooltip>
        </div>
      )}
      {/* 编辑区 */}
      <div style={{ display: 'flex', gap: 24 }}>
        <textarea
          ref={textareaRef}
          value={markdown}
          onChange={handleChange}
          readOnly={isViewer}
          style={{ width: 400, height: 400, fontSize: 16, fontFamily: 'monospace', borderRadius: 8, border: '1.5px solid #ddd', padding: 12 }}
        />
        <div 
          className="markdown-preview-pdf"
          style={{
            flex: 1,
            background: '#fff',
            padding: 16,
            borderRadius: 8,
            minHeight: 400,
            overflow: 'auto'
        }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeHighlight, rehypeKatex]}>{markdown}</ReactMarkdown>
        </div>
      </div>
      {/* 权限管理 */}
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
                  <span style={{ color: '#1677ff', marginLeft: 8 }}>（owner）</span>
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
          只能设置为协作者范围内的用户
        </div>
      </Drawer>
      {/* 历史版本 */}
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
                    {(item.contentSnapshot || '').slice(0, 30) || '[无内容]'}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>
      {/* 评论区 */}
      <Drawer
        title="评论区"
        placement="right"
        open={showCommentPanel}
        onClose={() => setShowCommentPanel(false)}
        mask={false}
        bodyStyle={{ padding: 18, minWidth: 320, maxWidth: 480 }}
      >
        {comments.filter(c => !c.parent).map(c => (
          <div key={c._id} style={{ marginBottom: 18, borderBottom: '1px solid #eee', paddingBottom: 8 }}>
            <div>
              <b>{c.author?.username || '匿名'}</b> <span style={{ color: '#888', fontSize: 12 }}>{new Date(c.createdAt).toLocaleString()}</span>
              {c.resolved && <span style={{ color: '#52c41a', marginLeft: 8 }}>已处理</span>}
            </div>
            <div style={{ margin: '6px 0' }}>{c.content}</div>
            <div>
              <Button size="small" onClick={() => { setReplyTo(c._id); setShowCommentModal(true); }}>回复</Button>
              <Button size="small" onClick={async () => {
                const token = localStorage.getItem('token');
                await axios.put(
                  `http://localhost:4000/documents/${id}/comments/${c._id}/resolve`,
                  {},
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                socketRef.current?.emit('commentsUpdated', { docId: id });
              }}>标记已处理</Button>
              <Button size="small" onClick={() => {
                if (!textareaRef.current || !c.anchor) return;
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(c.anchor.start, c.anchor.end);
              }}>定位</Button>
            </div>
            {/* 嵌套回复 */}
            {comments.filter(r => r.parent === c._id).map(r => (
              <div key={r._id} style={{ marginLeft: 18, marginTop: 8, borderLeft: '2px solid #eee', paddingLeft: 8 }}>
                <div>
                  <b>{r.author?.username || '匿名'}</b> <span style={{ color: '#888', fontSize: 12 }}>{new Date(r.createdAt).toLocaleString()}</span>
                  {r.resolved && <span style={{ color: '#52c41a', marginLeft: 8 }}>已处理</span>}
                </div>
                <div style={{ margin: '6px 0' }}>{r.content}</div>
              </div>
            ))}
          </div>
        ))}
      </Drawer>
      {/* 评论弹窗 */}
      <Modal
        open={showCommentModal}
        title={replyTo ? '回复评论' : '插入评论'}
        onCancel={() => setShowCommentModal(false)}
        onOk={async () => {
          const token = localStorage.getItem('token');
          if (!token || !id) return;
          if (replyTo) {
            await axios.post(
              `http://localhost:4000/documents/${id}/comments/${replyTo}/reply`,
              { content: commentContent },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          } else {
            await axios.post(
              `http://localhost:4000/documents/${id}/comments`,
              { content: commentContent, anchor: commentAnchor },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
          setCommentContent('');
          setShowCommentModal(false);
          setReplyTo(null);
          socketRef.current?.emit('commentsUpdated', { docId: id });
          fetchComments();
        }}
      >
        <Input.TextArea
          value={commentContent}
          onChange={e => setCommentContent(e.target.value)}
          rows={4}
          placeholder="请输入评论内容"
        />
      </Modal>
      {/* 历史对比弹窗 */}
      <Modal
        open={!!compareContent}
        title="历史版本对比"
        onCancel={closeCompare}
        footer={null}
        width={900}
      >
        {(() => {
          const leftLines = compareContent?.old ? (compareContent.old as string).split('\n') : [];
          const rightLines = compareContent?.now ? (compareContent.now as string).split('\n') : [];
          const maxLines = Math.max(leftLines.length, rightLines.length);
          return (
            <div style={{ display: 'flex', gap: 16, minHeight: 200 }}>
              <div style={{ flex: 1, borderRight: '1px solid #eee', paddingRight: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>历史版本</div>
                <div style={{ background: '#f6f6f6', padding: 8, minHeight: 120 }}>
                  {leftLines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, paddingLeft: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>当前内容</div>
                <div style={{ background: '#f6f6f6', padding: 8, minHeight: 120 }}>
                  {Array.from({ length: maxLines }).map((_, i) => {
                    const oldLine = leftLines[i] || '';
                    const newLine = rightLines[i] || '';
                    if (trimLineEnd(oldLine) === trimLineEnd(newLine)) {
                      return <div key={i}>{newLine}</div>;
                    } else {
                      return <div key={i} style={{ color: '#1976d2' }} dangerouslySetInnerHTML={{ __html: diffCharsHtml(oldLine, newLine) }} />;
                    }
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default MarkdownEditor;