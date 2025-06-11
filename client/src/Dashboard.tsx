import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button, Modal, Input, List, Avatar, message, Select, Tag } from 'antd';
import { UserOutlined, PlusOutlined, LogoutOutlined, LinkOutlined } from '@ant-design/icons';

const { Option } = Select;

const Dashboard: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [openedDocuments, setOpenedDocuments] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [docFormat, setDocFormat] = useState<string>('docx');
  const [editorUsernames, setEditorUsernames] = useState<string[]>([]);
  const [viewerUsernames, setViewerUsernames] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const navigate = useNavigate();

  // 拉取文档列表
  const fetchDocuments = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/login');
    setLoading(true);
    try {
      const docsRes = await axios.get('http://localhost:4000/documents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDocuments(docsRes.data);
    } catch (err) {
      message.error('Failed to fetch documents.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // 拉取用户和文档
  useEffect(() => {
    const fetchUserAndDocs = async () => {
      const token = localStorage.getItem('token');
      if (!token) return navigate('/login');
      setLoading(true);
      try {
        const userRes = await axios.get('http://localhost:4000/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(userRes.data);
        await fetchDocuments();
      } catch (err) {
        message.error('Session expired, please login again.');
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchUserAndDocs();
  }, [navigate, fetchDocuments]); // 现在 fetchDocuments 是 useCallback，依赖不会变

  useEffect(() => {
    const fetchUsers = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await axios.get('http://localhost:4000/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllUsers(res.data);
    };
    fetchUsers();
  }, []);

  const showModal = () => {
    setNewTitle('');
    setDocFormat('docx');
    setEditorUsernames([]);
    setViewerUsernames([]);
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };


  // 创建文档
  const handleCreateDocument = async () => {
    if (!newTitle.trim()) {
      message.warning('Please enter document title');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      message.error('You must be logged in to create a document.');
      return navigate('/login');
    }
    try {
      const res = await axios.post(
        'http://localhost:4000/documents',
        { title: newTitle.trim(), format: docFormat },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsModalVisible(false);
      // 创建后根据格式跳转到不同页面
      if (docFormat === 'docx') {
        navigate(`/edit/${res.data._id}`);
      } else if (docFormat === 'xlsx') {
        navigate(`/sheet/${res.data._id}`);
      } else if (docFormat === 'md') {
        navigate(`/md/${res.data._id}`);
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        message.error('Failed to create document: ' + error.response.data.message);
      } else {
        message.error('Failed to create document.');
      }
      console.error('Create document error:', error);
    }
  };

  // 删除文档
  const handleDeleteDocument = async (doc: any) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除文档 "${doc.title}" 吗？此操作不可恢复！`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const token = localStorage.getItem('token');
        if (!token) {
          message.error('You must be logged in to delete a document.');
          return navigate('/login');
        }
        if (doc.owner._id === user._id) {
          try {
            await axios.delete(`http://localhost:4000/documents/${doc._id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            await fetchDocuments(); // 删除后刷新
            message.success('Document deleted.');
          } catch (error) {
            message.error('Failed to delete document.');
            console.error(error);
          }
        } else {
          message.warning('Only owner can delete the document.');
        }
      }
    });
  };

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('token_expire');
    message.success('Logged out');
    navigate('/login');
  };

  // 判断当前用户角色
  const getRole = (doc: any) => {
    if (doc.owner._id === user._id) return 'owner';
    if (doc.editors.some((e: any) => e._id === user._id)) return 'editor';
    if (doc.viewers && doc.viewers.some((v: any) => v._id === user._id)) return 'viewer';
    return '';
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(120deg, #f8fafc 0%, #e9efff 100%)',
        padding: 0
      }}
    >
      {/* 顶部导航 */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 2px 16px #0001',
          padding: '16px 40px',
          margin: '0 auto 36px auto',
          maxWidth: 1100,
          minHeight: 64,
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}
      >
        <h1 style={{ margin: 0, fontWeight: 700, fontSize: 26, letterSpacing: 1, color: '#222' }}>📄 我的文档</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {user && (
            <Avatar
              size={44}
              src={user.avatar || undefined}
              icon={!user.avatar && <UserOutlined />}
              style={{ cursor: 'pointer', border: '2px solid #e6f7ff', background: '#f0f5ff' }}
              onClick={() => navigate('/personal-center')}
            />
          )}
          <Button icon={<LogoutOutlined />} onClick={handleLogout} type="primary" danger>
            退出登录
          </Button>
        </div>
      </header>

      {/* 新建文档按钮 */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'center',
        gap: 24,
        maxWidth: 1100,
        margin: '0 auto 24px auto'
      }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={showModal}
          style={{
            fontWeight: 600,
            fontSize: 16,
            borderRadius: 8,
            boxShadow: '0 2px 8px #91d5ff33',
            padding: '0 32px'
          }}
          size="large"
        >
          新建文档
        </Button>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{
            fontWeight: 600,
            fontSize: 16,
            borderRadius: 8,
            boxShadow: '0 2px 8px #91d5ff33',
            padding: '0 32px'
          }}
          onClick={() => setJoinModalVisible(true)}
          size="large"
        >
          加入文档
        </Button>
      </div>

      {/* 文档列表 */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 8px' }}>
        <List
          grid={{ gutter: 32, column: 2 }}
          header={
            <div style={{ fontWeight: 600, fontSize: 18, color: '#555', padding: '0 8px' }}>
              文档列表
            </div>
          }
          loading={loading}
          bordered={false}
          dataSource={documents}
          locale={{ emptyText: '暂无文档' }}
          renderItem={(doc) => {
            const role = getRole(doc);
            //根据 format 跳转
            const handleGoEdit = () => {
              if (doc.format === 'docx' || !doc.format) {
                navigate(`/edit/${doc._id}`);
              } else if (doc.format === 'xlsx') {
                navigate(`/sheet/${doc._id}`);
              } else if (doc.format === 'md') {
                navigate(`/md/${doc._id}`);
              }
            };
            return (
              <List.Item key={doc._id}>
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    boxShadow: '0 4px 24px #0001',
                    padding: '24px 28px 18px 28px',
                    minHeight: 120,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    position: 'relative',
                    border: '1px solid #f0f0f0',
                    cursor: 'pointer'
                  }}
                  onMouseOver={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px #91d5ff33';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px) scale(1.01)';
                  }}
                  onMouseOut={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px #0001';
                    (e.currentTarget as HTMLDivElement).style.transform = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 600, color: '#222', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.title}
                    </span>
                    {role === 'owner' && (
                      <Tag color="blue" style={{ marginLeft: 10, borderRadius: 8, fontWeight: 500, fontSize: 13 }}>OWNER</Tag>
                    )}
                    {role === 'editor' && (
                      <Tag color="green" style={{ marginLeft: 10, borderRadius: 8, fontWeight: 500, fontSize: 13 }}>EDITOR</Tag>
                    )}
                    {role === 'viewer' && (
                      <Tag color="default" style={{ marginLeft: 10, borderRadius: 8, fontWeight: 500, fontSize: 13 }}>VIEWER</Tag>
                    )}
                  </div>
                  <div style={{ color: '#aaa', fontSize: 12, marginBottom: 12 }}>
                    格式: {doc.format?.toUpperCase() || 'DOCX'} | 拥有者: {doc.owner.username}
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    {(role === 'owner' || role === 'editor') && (
                      <Button type="primary" size="small" style={{ borderRadius: 6 }} onClick={handleGoEdit}>
                        编辑
                      </Button>
                    )}
                    {role === 'viewer' && (
                      <Button size="small" style={{ borderRadius: 6 }} onClick={handleGoEdit}>
                        查看
                      </Button>
                    )}
                    {role === 'owner' && (
                      <Button danger size="small" style={{ borderRadius: 6 }} onClick={() => handleDeleteDocument(doc)}>
                        删除
                      </Button>
                    )}
                    <Button
                      size="small"
                      style={{ borderRadius: 6 }}
                      onClick={() => {
                        Modal.info({
                          title: '文档分享链接',
                          content: (
                            <div>
                              <Input
                                value={`${window.location.origin}/edit/${doc.joinLink}`}
                                readOnly
                                style={{ width: '100%', marginBottom: 8 }}
                              />
                              <Button
                                type="primary"
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}/edit/${doc.joinLink}`);
                                  message.success('链接已复制');
                                }}
                              >
                                复制链接
                              </Button>
                            </div>
                          ),
                          okText: '关闭'
                        });
                      }}
                    >
                      复制链接
                    </Button>
                  </div>
                </div>
              </List.Item>
            );
          }}
          style={{ marginBottom: 30 }}
        />
      </div>

      {/* 新建文档弹窗 */}
      <Modal
        title={<div style={{ textAlign: 'center', fontWeight: 700, fontSize: 20, letterSpacing: 1 }}>新建文档</div>}
        open={isModalVisible}
        onOk={handleCreateDocument}
        onCancel={handleCancel}
        okText="创建"
        cancelText="取消"
        centered
        bodyStyle={{
          padding: '32px 32px 16px 32px',
          background: 'linear-gradient(120deg, #f8fafc 0%, #e9efff 100%)'
        }}
        style={{
          borderRadius: 14,
          minWidth: 380
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <Input
            placeholder="请输入文档标题"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onPressEnter={handleCreateDocument}
            autoFocus
            style={{
              marginBottom: 18,
              borderRadius: 8,
              boxShadow: '0 2px 8px #e6f7ff33',
              fontSize: 16,
              padding: '8px 14px'
            }}
            maxLength={40}
          />
          <Select
            value={docFormat}
            onChange={(value) => setDocFormat(value)}
            style={{
              width: '100%',
              borderRadius: 8,
              boxShadow: '0 2px 8px #e6f7ff33'
            }}
            size="large"
          >
            <Option value="docx">文档（.docx）</Option>
            <Option value="xlsx">表格（.xlsx）</Option>
            <Option value="md">Markdown（.md）</Option>
          </Select>
        </div>
      </Modal>

      {/* 加入文档弹窗 */}
      <Modal
        title={<div style={{ textAlign: 'center', fontWeight: 700, fontSize: 20, letterSpacing: 1 }}>加入文档</div>}
        open={joinModalVisible}
        onOk={async () => {
          if (!joinInput.trim()) {
            message.warning('请输入文档链接');
            return;
          }
          let joinLink = joinInput.trim();
          const match = joinLink.match(/\/edit\/([a-zA-Z0-9_-]{8,})$/);
          if (match) joinLink = match[1];

          const token = localStorage.getItem('token');
          try {
            await axios.post('http://localhost:4000/documents/join', {
              joinLink
            }, {
              headers: { Authorization: `Bearer ${token}` }
            });
            message.success('加入成功');
            setJoinModalVisible(false);
            setJoinInput('');
            fetchDocuments();
          } catch (e: any) {
            message.error(e?.response?.data?.message || '加入失败');
          }
        }}
        onCancel={() => setJoinModalVisible(false)}
        okText="加入"
        cancelText="取消"
        centered
        bodyStyle={{
          padding: '32px 32px 16px 32px',
          background: 'linear-gradient(120deg, #f8fafc 0%, #e9efff 100%)'
        }}
        style={{
          borderRadius: 14,
          minWidth: 380
        }}
        okButtonProps={{
          style: {
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            height: 40,
            minWidth: 100,
            boxShadow: '0 2px 8px #91d5ff33'
          },
          size: 'large',
          type: 'primary'
        }}
        cancelButtonProps={{
          style: {
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            height: 40,
            minWidth: 100
          },
          size: 'large'
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <Input
            placeholder="请输入文档链接"
            value={joinInput}
            onChange={e => setJoinInput(e.target.value)}
            onPressEnter={() => {/* 同上 onOk 逻辑 */}}
            autoFocus
            style={{
              marginBottom: 18,
              borderRadius: 8,
              boxShadow: '0 2px 8px #e6f7ff33',
              fontSize: 16,
              padding: '8px 14px'
            }}
            maxLength={80}
          />
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;
