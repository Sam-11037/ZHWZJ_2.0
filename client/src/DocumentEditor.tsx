import React, { useEffect, useRef, useState, useCallback } from 'react';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import 'quill/dist/quill.snow.css';
import { QuillBinding } from 'y-quill';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client'; 
import { Modal, Select, Button, message, Drawer, Radio, Input,Form } from 'antd'; // 替换 Modal, Select
import { ExclamationCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import './word-page.css';
import { List, Tooltip ,Dropdown, Menu} from 'antd';
import { HistoryOutlined, RollbackOutlined, DiffOutlined } from '@ant-design/icons';
import DiffMatchPatch from 'diff-match-patch';
import { QuillDeltaToHtmlConverter } from 'quill-delta-to-html';
import Delta from 'quill-delta';
import { DownOutlined } from '@ant-design/icons';
import ImageResize from 'quill-image-resize-module-plus';
import htmlDocx from 'html-docx-js/dist/html-docx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';


Quill.register('modules/imageResize', ImageResize);
// 获取内容
function getPlainTextFromDelta(delta: any) {
  if (!delta) return '';
  // 如果 delta 为空（null/undefined），直接返回空字符串

  if (typeof delta === 'string') return delta;
  // 如果 delta 本身就是字符串，直接返回

  // 兼容直接是 Delta 数组的情况
  if (Array.isArray(delta)) {
    return delta.map((op: any) => typeof op.insert === 'string' ? op.insert : '').join('');
    // 如果 delta 是数组（即 ops 数组），遍历每个 op，
    // 如果 op.insert 是字符串就取出来，否则取空字符串，最后拼接成一个字符串
  }

  if (Array.isArray(delta.ops)) {
    return delta.ops.map((op: any) => typeof op.insert === 'string' ? op.insert : '').join('');
    // 如果 delta 是对象且有 ops 数组，遍历 ops，取出所有字符串 insert，拼接成字符串
  }

  return '';
  // 其它情况返回空字符串
}
function deltaToHtml(delta: any) {
  if (!delta) return '';
  let ops = Array.isArray(delta) ? delta : delta.ops;
  if (!ops) return '';
  const converter = new QuillDeltaToHtmlConverter(ops, {});
  return converter.convert();
}
function isAttributesEqual(a: any, b: any) {
  const keysA = Object.keys(a || {}).filter(k => a[k] !== undefined && a[k] !== null);
  const keysB = Object.keys(b || {}).filter(k => b[k] !== undefined && b[k] !== null);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
function isTextOpsFormatEqual(opsA: any[], opsB: any[]): boolean {
  // 只比较 insert 为字符串的 op
  const textOpsA = (opsA || []).filter(op => typeof op.insert === 'string');
  const textOpsB = (opsB || []).filter(op => typeof op.insert === 'string');
  if (textOpsA.length !== textOpsB.length) return false;
  for (let i = 0; i < textOpsA.length; i++) {
    const a = textOpsA[i];
    const b = textOpsB[i];
    if (a.insert !== b.insert) return false;
    if (!isAttributesEqual(a.attributes, b.attributes)) return false;
  }
  return true;
}
function trimLineEnd(str: string) {
  // 去除所有末尾换行和空白
  return (str || '').replace(/[\n\r\s]+$/, '');
}
// 新增：行级diff工具
function splitDeltaByLine(delta: any) {
  // 返回 [{ops, text, start, length}]
  const ops = Array.isArray(delta) ? delta : delta?.ops || [];
  let result: { ops: any[], text: string, start: number, length: number }[] = [];
  let buf: any[] = [];
  let text = '';
  let start = 0;
  let idx = 0;
  for (const op of ops) {
    if (typeof op.insert === 'string') {
      let remain = op.insert;
      while (remain.length) {
        const nl = remain.indexOf('\n');
        if (nl === -1) {
          buf.push({ ...op, insert: remain });
          text += remain;
          idx += remain.length;
          remain = '';
        } else {
          // 到行尾
          const seg = remain.slice(0, nl + 1);
          buf.push({ ...op, insert: seg });
          text += seg;
          result.push({ ops: buf, text, start, length: idx + nl + 1 - start });
          buf = [];
          text = '';
          start = idx + nl + 1;
          idx += nl + 1;
          remain = remain.slice(nl + 1);
        }
      }
    } else {
      // 非字符串（如图片、公式等），直接作为一段
      buf.push(op);
    }
  }
  if (buf.length) {
    result.push({ ops: buf, text, start, length: idx - start });
  }
  return result;
}
function isImageOp(op: any) {
  return typeof op.insert === 'object' && op.insert && op.insert.image;
}
function renderImageOp(op: any) {
  if (isImageOp(op)) {
    const src = op.insert.image;
    return `<img src="${src}" alt="图片" style="max-width:120px;max-height:80px;vertical-align:middle;box-shadow:0 1px 4px #ccc;margin:0 4px;" />`;
  }
  return '';
}

// 行内字符diff高亮
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

// 判断图片内容是否一致
function isImagesEqual(imagesA: any[], imagesB: any[]) {
  if (imagesA.length !== imagesB.length) return false;
  for (let i = 0; i < imagesA.length; i++) {
    if (imagesA[i]?.insert?.image !== imagesB[i]?.insert?.image) return false;
  }
  return true;
}

function lineDiffHtml(oldDelta: any, newDelta: any) {
  const oldLineObjs = splitDeltaByLine(oldDelta);
  const newLineObjs = splitDeltaByLine(newDelta);
  const maxLines = Math.max(oldLineObjs.length, newLineObjs.length);
  let rightHtml: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLineObjs[i]?.ops || [];
    const newLine = newLineObjs[i]?.ops || [];
    const oldImages = oldLine.filter(isImageOp);
    const newImages = newLine.filter(isImageOp);
    const oldText = getPlainTextFromDelta(oldLine);
    const newText = getPlainTextFromDelta(newLine);

    // 图片删除
    if (oldImages.length && !newImages.length) {
      rightHtml.push(
        `<div style="background:#ffeaea;color:#e74c3c;"><b>- </b>${oldImages.map(renderImageOp).join('')}</div>`
      );
    }
    // 图片新增
    if (!oldImages.length && newImages.length) {
      rightHtml.push(
        `<div style="background:#d4fcdc;color:#388e3c;"><b>+ </b>${newImages.map(renderImageOp).join('')}</div>`
      );
    }
    // 图片变动
    if (
      oldImages.length &&
      newImages.length &&
      (!isImagesEqual(oldImages, newImages))
    ) {
      rightHtml.push(
        `<div style="color:#1976d2;"><b>? </b>图片变动</div>`
      );
    }

    // 文本和图片都一致且格式一致时，完整渲染
    if (
      trimLineEnd(oldText) === trimLineEnd(newText) &&
      isImagesEqual(oldImages, newImages) &&
      isTextOpsFormatEqual(oldLine, newLine)
    ) {
      rightHtml.push(`<div>${deltaToHtml(newLine)}</div>`);
    } else if (oldLine.length && newLine.length) {
      // 只要内容、格式或图片有变化，显示 ? 行
      if (oldText || newText) {
        rightHtml.push(
          `<div style="color:#1976d2;"><b>? </b>${diffCharsHtml(oldText, newText)}</div>`
        );
      }
    }
  }

  return { rightHtml };
}
const Font = Quill.import('formats/font');
Font.whitelist = [
  '', 'serif', 'monospace', '宋体', '黑体', '楷体', '微软雅黑', 'Arial', 'times-new-roman'
];
Quill.register(Font, true);
// 字号样式支持
const fontSizeStyle = Quill.import('attributors/style/size');
fontSizeStyle.whitelist = [
  '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px',
];
Quill.register(fontSizeStyle, true);
Quill.register('modules/cursors', QuillCursors);

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
  const bindingRef = useRef<any>(null);

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
  // 评论相关
  const [comments, setComments] = useState<any[]>([]);
  const [showCommentPanel, setShowCommentPanel] = useState(true);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [commentAnchor, setCommentAnchor] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  // 表格相关
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [tableData, setTableData] = useState<string[][]>(
    Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ''))
  );
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

    // 监听权限变更
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
        toolbar: isViewer ? false :  '#toolbar' ,
        cursors: true,
        history: { userOnly: true },
        imageResize: {} ,
        
      },
      readOnly: isViewer
    });
    quillRef.current = quill;

    // 绑定 Yjs 和 Quill
    const ytext = ydoc.getText('quill');

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

  // 导出为 docx
  const handleExportDocx = () => {
    if (!quillRef.current) return;
    const html = quillRef.current.root.innerHTML;
    const converted = htmlDocx.asBlob(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(converted);
    a.download = `${docTitle || '文档'}.docx`;
    a.click();
  };

  // 导出为 PDF
  const handleExportPDF = async () => {
    if (!quillRef.current) return;
    const editorElem = quillRef.current.root;
    // 用 html2canvas 截图
    const canvas = await html2canvas(editorElem, { scale: 2, backgroundColor: '#fff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pageWidth;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
    // 多页处理
    if (pdfHeight > pageHeight) {
      let heightLeft = pdfHeight - pageHeight;
      while (heightLeft > 0) {
        position = position - pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
    }
    pdf.save(`${docTitle || '文档'}.pdf`);
  };

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
      console.log('[client] received titleUpdated', eventDocId, title);
      if (eventDocId === id && title) {
        setDocTitle(title);
      }
    };
    socket.on('titleUpdated', handler);
    return () => {
      socket.off('titleUpdated', handler);
    };
  }, [id]);
  // 拉取评论
  const fetchComments = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token || !id) return;
    const res = await axios.get(`http://localhost:4000/documents/${id}/comments`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setComments(res.data);
  }, [id]);
  // 打开评论区时自动拉取评论
  useEffect(() => {
    if (showCommentPanel) {
      fetchComments();
    }
  }, [showCommentPanel]);

  // 监听 socket 评论变动
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.on('commentsUpdated', fetchComments);
    return () => {
      socket.off('commentsUpdated', fetchComments);
    };
  }, [fetchComments, socketRef.current]);
  // 评论锚点高亮
  useEffect(() => {
    if (!quillRef.current || !comments.length) return;
    // 先移除所有高亮
    if (quillRef.current) {
      quillRef.current.formatText(0, quillRef.current.getLength(), 'background', false, 'api');
      comments.forEach(c => {
        if (c.anchor && !c.resolved) {
          quillRef.current!.formatText(c.anchor.index, c.anchor.length, 'background', '#ffe58f', 'api');
        }
      });
    }
  }, [comments]);

  return (
    <div>
      {/* 第一排：居中对称，左侧本人+光标颜色，右侧在线用户 */}
      <div
        className="editor-header-users"
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
        className="editor-header-title"
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
        {/* 右侧按钮 */}
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
          {!isViewer && (
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
          )}
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
          <Dropdown
            overlay={
              <Menu>
                <Menu.Item key="docx" onClick={handleExportDocx}>
                  导出为 docx
                </Menu.Item>
                <Menu.Item key="pdf" onClick={handleExportPDF}>
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
            <Button
              size="middle"
              style={{
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 15,
                padding: '0 18px',
                height: 36,
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

      {/* 第三排：富文本工具栏单独一行 */}
      {!isViewer && (
        <div
          id="toolbar"
          className="editor-toolbar"
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
            gap: 6
          }}
        >
          <Tooltip title="标题/正文">
            <select className="ql-header" defaultValue="" style={{ minWidth: 70 }}>
              <option value="">正文</option>
              <option value="1">标题1</option>
              <option value="2">标题2</option>
              <option value="3">标题3</option>
              <option value="4">标题4</option>
              <option value="5">标题5</option>
              <option value="6">标题6</option>
            </select>
          </Tooltip>
          <Tooltip title="字体">
            <select className="ql-font" defaultValue="" style={{ minWidth: 90 }}>
              <option value="">默认字体</option>
              <option value="serif" style={{ fontFamily: 'serif' }}>衬线</option>
              <option value="monospace" style={{ fontFamily: 'monospace' }}>等宽</option>
              <option value="宋体" style={{ fontFamily: 'SimSun' }}>宋体</option>
              <option value="黑体" style={{ fontFamily: 'SimHei' }}>黑体</option>
              <option value="楷体" style={{ fontFamily: 'KaiTi' }}>楷体</option>
              <option value="微软雅黑" style={{ fontFamily: 'Microsoft YaHei' }}>微软雅黑</option>
              <option value="Arial" style={{ fontFamily: 'Arial' }}>Arial</option>
              <option value="times-new-roman" style={{ fontFamily: 'Times New Roman' }}>Times New Roman</option>
            </select>
          </Tooltip>
          <Tooltip title="字号">
            <select className="ql-size" defaultValue="16px" style={{ minWidth: 70 }}>
              <option value="10px">10px</option>
              <option value="12px">12px</option>
              <option value="14px">14px</option>
              <option value="16px">16px</option>
              <option value="18px">18px</option>
              <option value="20px">20px</option>
              <option value="24px">24px</option>
              <option value="28px">28px</option>
              <option value="32px">32px</option>
              <option value="36px">36px</option>
              <option value="48px">48px</option>
              <option value="56px">56px</option>
              <option value="72px">72px</option>
            </select>
          </Tooltip>
          <Tooltip title="加粗"><button className="ql-bold" /></Tooltip>
          <Tooltip title="斜体"><button className="ql-italic" /></Tooltip>
          <Tooltip title="下划线"><button className="ql-underline" /></Tooltip>
          <Tooltip title="删除线"><button className="ql-strike" /></Tooltip>
          <Tooltip title="上标"><button className="ql-script" value="super" /></Tooltip>
          <Tooltip title="下标"><button className="ql-script" value="sub" /></Tooltip>
          <Tooltip title="引用"><button className="ql-blockquote" /></Tooltip>
          <Tooltip title="代码块"><button className="ql-code-block" /></Tooltip>
          <Tooltip title="有序列表"><button className="ql-list" value="ordered" /></Tooltip>
          <Tooltip title="无序列表"><button className="ql-list" value="bullet" /></Tooltip>
          <Tooltip title="任务列表"><button className="ql-list" value="check" /></Tooltip>
          <Tooltip title="左对齐"><button className="ql-align" value="" /></Tooltip>
          <Tooltip title="居中"><button className="ql-align" value="center" /></Tooltip>
          <Tooltip title="右对齐"><button className="ql-align" value="right" /></Tooltip>
          <Tooltip title="两端对齐"><button className="ql-align" value="justify" /></Tooltip>
          <Tooltip title="减少缩进"><button className="ql-indent" value="-1" /></Tooltip>
          <Tooltip title="增加缩进"><button className="ql-indent" value="+1" /></Tooltip>
          <Tooltip title="从右到左"><button className="ql-direction" value="rtl" /></Tooltip>
          <Tooltip title="字体颜色"><select className="ql-color" /></Tooltip>
          <Tooltip title="背景色"><select className="ql-background" /></Tooltip>
          <Tooltip title="插入链接"><button className="ql-link" /></Tooltip>
          <Tooltip title="插入图片">
            <button className="ql-image" style={{ fontSize: 20, padding: '0 6px' }}>
              <img
                src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f5bc.svg"
                alt="图片"
                style={{ width: 18, height: 18, verticalAlign: 'middle', pointerEvents: 'none' }}
              />
            </button>
          </Tooltip>
          <Tooltip title="插入公式"><button className="ql-formula" /></Tooltip>
          <Tooltip title="清除格式"><button className="ql-clean" /></Tooltip>
          <Tooltip title="插入评论">
            <button
              className="ql-insert-comment"
              onClick={() => {
                if (!quillRef.current) return;
                const range = quillRef.current.getSelection();
                if (!range || range.length === 0) return message.warning('请先选中要评论的内容');
                setCommentAnchor(range);
                setReplyTo(null);
                setShowCommentModal(true);
              }}
              style={{ fontSize: 18, padding: '0 6px' }}
            >💬</button>
          </Tooltip>
        </div>
      )}

      {/* Word页面样式包裹 */}
      <div
        className="word-page-wrap"
        style={{
          marginRight: showCommentPanel ? 400 : 0, // 预留 Drawer 宽度
          transition: 'margin-right 0.3s'
        }}
      >
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
              {/* 定位到锚点 */}
              <Button size="small" onClick={() => {
                if (!quillRef.current || !c.anchor) return;
                quillRef.current.setSelection(c.anchor.index, c.anchor.length, 'user');
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
      <Modal
        open={showCommentModal}
        title={replyTo ? '回复评论' : '插入评论'}
        onCancel={() => setShowCommentModal(false)}
        onOk={async () => {
          const token = localStorage.getItem('token');
          if (!token || !id) return;
          if (replyTo) {
            // 回复
            await axios.post(
              `http://localhost:4000/documents/${id}/comments/${replyTo}/reply`,
              { content: commentContent },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          } else {
            // 新评论
            await axios.post(
              `http://localhost:4000/documents/${id}/comments`,
              { content: commentContent, anchor: commentAnchor },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
          setCommentContent('');
          setShowCommentModal(false);
          setReplyTo(null);
          // 通知 socket
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
      <Modal
        open={!!compareContent}
        title="历史版本对比"
        onCancel={closeCompare}
        footer={null}
        width={900}
      >
        {(() => {
          const leftHtml = compareContent?.old ? splitDeltaByLine(compareContent.old).map(l => deltaToHtml(l.ops)) : [];
          const { rightHtml } = compareContent
            ? lineDiffHtml(compareContent.old, compareContent.now)
            : { rightHtml: [] };
          return (
            <div style={{ display: 'flex', gap: 16, minHeight: 200 }}>
              <div style={{ flex: 1, borderRight: '1px solid #eee', paddingRight: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>历史版本</div>
                <div style={{ background: '#f6f6f6', padding: 8, minHeight: 120 }}>
                  {leftHtml.map((html, i) => (
                    <div key={i} dangerouslySetInnerHTML={{ __html: html }} />
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, paddingLeft: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>当前内容</div>
                <div style={{ background: '#f6f6f6', padding: 8, minHeight: 120 }}>
                  {rightHtml.map((html, i) => (
                    <div key={i} dangerouslySetInnerHTML={{ __html: html }} />
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default DocumentEditor;