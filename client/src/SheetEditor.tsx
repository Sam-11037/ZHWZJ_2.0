import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { io, Socket } from 'socket.io-client';
import { Button, Drawer, Modal, Input, message, List, Tooltip, Dropdown, Menu, Radio } from 'antd';
import { HistoryOutlined, DiffOutlined, RollbackOutlined, DownOutlined, SettingOutlined, ExclamationCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import api from './api'; // 新增导入
import zhCN from 'handsontable/i18n/languages/zh-CN';
Handsontable.languages.registerLanguageDictionary(zhCN);

const wsUrl = 'ws://192.168.43.104:1234';
const socketUrl = 'http://192.168.43.104:4000';

const SheetEditor: React.FC = () => {
  const { id } = useParams();
  const tableRef = useRef<HTMLDivElement>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const hotRef = useRef<any>(null);

  // 标题相关
  const [docTitle, setDocTitle] = useState('表格');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(docTitle);

  // 权限相关
  const [docInfo, setDocInfo] = useState<any>(null);
  const [showPermDrawer, setShowPermDrawer] = useState(false);
  const [editors, setEditors] = useState<string[]>([]);
  const [viewers, setViewers] = useState<string[]>([]);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [userPermMap, setUserPermMap] = useState<Record<string, 'edit' | 'view'>>({});

  // 历史版本
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [saving, setSaving] = useState(false);

  // 协同用户
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; username: string; color: string }[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');

  const isViewer = viewers.includes(userId);


  // 拉取当前用户信息
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch('http://reuben.s7.tunnelfrp.com/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(user => {
        setUserId(user._id);
        setUsername(user.username);
        localStorage.setItem('userId', user._id);
        localStorage.setItem('username', user.username);
      });
  }, []);

  // 拉取文档详情
  useEffect(() => {
    const fetchDocInfo = async () => {
      const token = localStorage.getItem('token');
      if (!token || !id) return;
      try {
        const res = await fetch(`http://reuben.s7.tunnelfrp.com/documents/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const doc = await res.json();
        setDocTitle(doc.title || '表格');
        setTitleInput(doc.title || '表格');
        setDocInfo(doc);
        setEditors(doc.editors?.map((u: any) => u._id) || []);
        setViewers(doc.viewers?.map((u: any) => u._id) || []);
        setCollaborators(doc.documentCollUser || []);
        // 初始化权限映射
        const map: Record<string, 'edit' | 'view'> = {};
        (doc.documentCollUser || []).forEach((u: any) => {
          if (doc.owner && u._id === doc.owner._id) return;
          if (doc.editors?.some((e: any) => (e._id || e) === u._id)) map[u._id] = 'edit';
          else map[u._id] = 'view';
        });
        setUserPermMap(map);
      } catch {}
    };
    fetchDocInfo();
  }, [id]);

  // 标题编辑
  useEffect(() => {
    setTitleInput(docTitle);
  }, [docTitle]);
  const handleTitleSave = async () => {
    if (!id || !titleInput.trim() || titleInput === docTitle) {
      setEditingTitle(false);
      setTitleInput(docTitle);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await fetch(`http://reuben.s7.tunnelfrp.com/documents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: titleInput.trim() })
      });
      setDocTitle(titleInput.trim());
      setEditingTitle(false);
      message.success('标题修改成功');
    } catch (e) {
      message.error('标题修改失败');
      setTitleInput(docTitle);
      setEditingTitle(false);
    }
  };

  // 协同初始化
  useEffect(() => {
    if (!id) return;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const provider = new WebsocketProvider(wsUrl, `sheet-${id}`, ydoc);
    providerRef.current = provider;

    const yarray = ydoc.getArray('table');
    function get2DArray(arr: any) {
      if (!Array.isArray(arr)) return [];
      const rows = arr.filter(row => Array.isArray(row));
      const maxCols = Math.max(5, ...rows.map(row => row.length));
      return Array.from({ length: Math.max(10, rows.length) }, (_, i) => {
        const row = rows[i] || [];
        return Array.from({ length: maxCols }, (_, j) => row[j] ?? '');
      });
    }

    if (tableRef.current && !hotRef.current) {
      hotRef.current = new Handsontable(tableRef.current, {
        data: get2DArray(yarray.toArray()),
        rowHeaders: true,
        colHeaders: true,
        licenseKey: 'non-commercial-and-evaluation',
        contextMenu: true,
        manualRowResize: true,
        manualColumnResize: true,
        manualRowMove: true,
        manualColumnMove: true,
        minRows: 1,
        minCols: 1,
        stretchH: 'all',
        width: '100%',
        height: 600,
        language: 'zh-CN',
        readOnly: isViewer, // 只读
        afterChange: (changes: any, source: string) => {
          if (isViewer) return;
          if (source !== 'loadData' && hotRef.current) {
            const data = get2DArray(hotRef.current.getData());
            yarray.delete(0, yarray.length);
            yarray.insert(0, data);
          }
        }
      });
    }

    yarray.observeDeep(() => {
      if (hotRef.current) {
        hotRef.current.loadData(get2DArray(yarray.toArray()));
      }
    });

    return () => {
      provider.destroy();
      ydoc.destroy();
      if (hotRef.current) {
        hotRef.current.destroy();
        hotRef.current = null;
      }
    };
  }, [id]);

  // socket.io 初始化
  useEffect(() => {
    if (!id || !userId || !username) return;
    const socket = io(socketUrl, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.emit('joinDoc', { docId: id, userId, username, color: getColorByUserId(userId) });

    socket.on('onlineUsers', (users) => {
      setOnlineUsers(users);
    });

    return () => {
      socket.emit('leaveDoc', { docId: id, userId });
      socket.disconnect();
    };
  }, [id, userId, username]);

  // 保存表格
  const handleSave = async () => {
    if (!id || !ydocRef.current) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const yarray = ydocRef.current.getArray('table');
      const content = yarray.toArray();
      await fetch(`http://reuben.s7.tunnelfrp.com/documents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content })
      });
      message.success('保存成功');
      fetchHistory();
    } catch (e) {
      message.error('保存失败');
    }
    setSaving(false);
  };

  // 导出为 Excel
  const handleExportExcel = () => {
    if (!hotRef.current) return;
    const data = hotRef.current.getData();
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${docTitle || '表格'}.xlsx`);
  };

  // 导出为 PDF
  const handleExportPDF = async () => {
    if (!tableRef.current) return;
    const oldBorder = tableRef.current.style.border;
    tableRef.current.style.border = 'none';
    const canvas = await html2canvas(tableRef.current, { scale: 2, backgroundColor: '#fff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pageWidth;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
    if (pdfHeight > pageHeight) {
      let heightLeft = pdfHeight - pageHeight;
      while (heightLeft > 0) {
        position = position - pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
    }
    pdf.save(`${docTitle || '表格'}.pdf`);
    tableRef.current.style.border = oldBorder;
  };


  // 历史版本
  const fetchHistory = async () => {
    if (!id) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://reuben.s7.tunnelfrp.com/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const doc = await res.json();
      setHistoryList(doc.editHistory || []);
    } catch (e) {
      message.error('获取历史版本失败');
    }
  };
  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line
  }, [id]);

  // 回滚历史版本
  const handleRollback = (item: any) => {
    Modal.confirm({
      title: '确定回滚到该历史版本？',
      icon: <ExclamationCircleOutlined />,
      okText: '回滚',
      okType: 'danger',
      cancelText: '取消',
      onOk() {
        if (hotRef.current && item.contentSnapshot && ydocRef.current) {
          // 1. 让本地表格显示历史内容
          hotRef.current.loadData(item.contentSnapshot);
          // 2. 同步到 yjs，所有协同用户自动同步
          const yarray = ydocRef.current.getArray('table');
          yarray.delete(0, yarray.length);
          yarray.insert(0, item.contentSnapshot);
          message.success('已回滚到该版本，请手动保存以生效');
          setShowHistoryDrawer(false);
        }
      }
    });
  };

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
      await fetch(
        `http://reuben.s7.tunnelfrp.com/documents/${id}/permission`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ editors, viewers })
        }
      );
      message.success('权限已更新');
      setShowPermDrawer(false);
      // 重新拉取文档信息
      const res = await fetch(`http://reuben.s7.tunnelfrp.com/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const doc = await res.json();
      setDocInfo(doc);
      setEditors(doc.editors?.map((u: any) => u._id) || []);
      setViewers(doc.viewers?.map((u: any) => u._id) || []);
      setCollaborators(doc.documentCollUser || []);
      // 计算变更用户
      const changed: string[] = [];
      (doc.documentCollUser || []).forEach((u: any) => {
        if (doc.owner && u._id === doc.owner._id) return;
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
          await fetch(
            `http://reuben.s7.tunnelfrp.com/documents/${id}/remove-collaborator`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ userId })
            }
          );
          message.success(`已移除协作者「${username}」`);
          // 重新拉取文档信息
          const res = await fetch(`http://reuben.s7.tunnelfrp.com/documents/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const doc = await res.json();
          setDocInfo(doc);
          setEditors(doc.editors?.map((u: any) => u._id) || []);
          setViewers(doc.viewers?.map((u: any) => u._id) || []);
          setCollaborators(doc.documentCollUser || []);
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

  const [compareContent, setCompareContent] = useState<{ old?: any[][], now?: any[][] } | null>(null);

  const handleCompare = (item: any) => {
    if (!hotRef.current) return;
    const now = hotRef.current.getData();
    setCompareContent({ old: item.contentSnapshot, now });
  };
  const closeCompare = () => setCompareContent(null);

  function renderSheetDiff(oldData: any[][] = [], nowData: any[][] = []) {
    const maxRows = Math.max(oldData.length, nowData.length);
    const maxCols = Math.max(
      ...[oldData, nowData].map(arr => Math.max(...(arr.map(row => row.length))))
    );
    const rows = [];
    for (let i = 0; i < maxRows; i++) {
      const oldRow = oldData[i] || [];
      const nowRow = nowData[i] || [];
      const cells = [];
      for (let j = 0; j < maxCols; j++) {
        const oldCell = oldRow[j] ?? '';
        const nowCell = nowRow[j] ?? '';
        let style: React.CSSProperties = {};
        if (oldCell !== nowCell) {
          if (oldCell && !nowCell) style = { background: '#ffeaea', color: '#e74c3c' };
          else if (!oldCell && nowCell) style = { background: '#d4fcdc', color: '#388e3c' };
          else style = { background: '#fffbe6', color: '#faad14' };
        }
        cells.push(
          <td key={j} style={{ ...style, border: '1px solid #eee', padding: 4, minWidth: 60 }}>
            {nowCell}
          </td>
        );
      }
      rows.push(<tr key={i}>{cells}</tr>);
    }
    return (
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>{rows}</tbody>
      </table>
    );
  }

  // 动态响应只读状态
  useEffect(() => {
    if (hotRef.current) {
      hotRef.current.updateSettings({ readOnly: isViewer });
    }
  }, [isViewer]);

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

  return (
    <div style={{ padding: 40 }}>
      {/* 顶部用户区 */}
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
        {/* 左侧本人 */}
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
              background: getColorByUserId(userId),
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
        {/* 右侧所有在线用户（包括自己） */}
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
                background: u.color || getColorByUserId(u.userId),
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

      {/* 标题和按钮区 */}
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
            <span role="img" aria-label="sheet" style={{ fontSize: 26 }}>📊</span>
          </div>
          {/* 标题可编辑 */}
          {editingTitle ? (
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
                cursor: docInfo && docInfo.owner && userId === docInfo.owner._id ? 'pointer' : 'default',
                marginRight: 8,
              }}
              title={docInfo && docInfo.owner && userId === docInfo.owner._id ? "点击修改标题" : ""}
              onClick={() => setEditingTitle(true)}
            >
              {docTitle}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            type="primary"
            size="middle"
            style={{
              borderRadius: 6, fontWeight: 500, fontSize: 15, padding: '0 18px', height: 36,
            }}
            onClick={handleSave}
            disabled={saving || isViewer}
          >
            {saving ? '保存中...' : '保存'}
          </Button>
          <Dropdown
            overlay={
              <Menu>
                <Menu.Item key="excel" onClick={handleExportExcel}>
                  导出为 Excel
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
                borderRadius: 6, fontWeight: 500, fontSize: 15, padding: '0 18px', height: 36,
                background: '#f5f5f5', border: '1.5px solid #aaa', color: '#333',
              }}
            >
              导出 <DownOutlined />
            </Button>
          </Dropdown>
          <Button icon={<HistoryOutlined />} onClick={() => setShowHistoryDrawer(true)}>
            历史版本
          </Button>
          {/* 权限管理，仅拥有者可见 */}
          {docInfo && docInfo.owner && userId === docInfo.owner._id && (
            <Button
              icon={<SettingOutlined />}
              onClick={() => setShowPermDrawer(true)}
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
            >
              权限管理
            </Button>
          )}
        </div>
      </div>

    

      <div ref={tableRef} style={{
        width: '100%',
        height: 600,
        margin: '0 auto 24px auto',
        background: '#fff',
        borderRadius: 8,
        border: '1.5px solid #1677ff',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }} />

      {/* 历史版本抽屉 */}
      <Drawer
        title="历史版本"
        open={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        width={500}
      >
        <List
          dataSource={historyList}
          renderItem={item => (
            <List.Item
              actions={[
                <Button icon={<DiffOutlined />} size="small" onClick={() => handleCompare(item)}>对比</Button>,
                <Button icon={<RollbackOutlined />} size="small" danger onClick={() => handleRollback(item)} disabled={isViewer}>回滚</Button>
              ]}
            >
              <List.Item.Meta
                title={item.editor?.username || '未知用户'}
                description={item.editedAt ? new Date(item.editedAt).toLocaleString() : ''}
              />
            </List.Item>
          )}
        />
      </Drawer>

      {/* 权限管理抽屉*/}
      <Drawer
        title="权限管理"
        open={showPermDrawer}
        onClose={() => setShowPermDrawer(false)}
        width={520}
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

      <Modal
        open={!!compareContent}
        title="历史版本对比"
        onCancel={closeCompare}
        footer={null}
        width={900}
      >
        <div style={{ display: 'flex', gap: 16, minHeight: 200 }}>
          <div style={{ flex: 1, borderRight: '1px solid #eee', paddingRight: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>历史版本</div>
            {renderSheetDiff(compareContent?.old, compareContent?.old)}
          </div>
          <div style={{ flex: 1, paddingLeft: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>当前内容</div>
            {renderSheetDiff(compareContent?.old, compareContent?.now)}
          </div>
        </div>
        <div style={{ marginTop: 12, color: '#888', fontSize: 13 }}>
          <span style={{ background: '#d4fcdc', color: '#388e3c', padding: '0 6px', borderRadius: 3, marginRight: 8 }}>新增</span>
          <span style={{ background: '#ffeaea', color: '#e74c3c', padding: '0 6px', borderRadius: 3, marginRight: 8 }}>删除</span>
          <span style={{ background: '#fffbe6', color: '#faad14', padding: '0 6px', borderRadius: 3 }}>修改</span>
        </div>
      </Modal>
    </div>
  );
};

export default SheetEditor;