import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, message, Upload, Input, Card, Divider, Space, Typography } from 'antd';
import { UploadOutlined, UserOutlined, LogoutOutlined, ArrowLeftOutlined, EditOutlined, LockOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const PersonalCenter: React.FC = () => {
  const [user, setUser] = useState<any>({});
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await axios.get('http://localhost:4000/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(res.data);
      } catch {
        message.error('Failed to fetch user info');
      }
    };
    fetchUser();
  }, []);

  const handleBeforeUpload = (file: any) => {
    setFileList([file]);
    return false;
  };

  const handleRemove = () => setFileList([]);

  const handleAvatarUpdate = async () => {
    if (fileList.length === 0) {
      message.warning('请选择图片文件');
      return;
    }
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('avatar', fileList[0]);
      const uploadRes = await axios.post('http://localhost:4000/upload-avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
        },
      });
      const avatarUrl = uploadRes.data.url;
      await axios.put(
        'http://localhost:4000/me',
        { avatar: avatarUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const res = await axios.get('http://localhost:4000/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data);
      message.success('头像修改成功');
      setAvatarModalVisible(false);
      setFileList([]);
    } catch (error) {
      message.error('头像上传或保存失败');
    } finally {
      setUploading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!oldPassword || !newPassword) {
      message.warning('请输入旧密码和新密码');
      return;
    }
    setPasswordUpdating(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        'http://localhost:4000/me/password',
        { oldPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('密码修改成功');
      setPasswordModalVisible(false);
      setOldPassword('');
      setNewPassword('');
    } catch (error: unknown) {
      let errorMsg = '密码修改失败';
      if (axios.isAxiosError(error)) {
        errorMsg = error.response?.data?.message || error.message;
      } else if (error instanceof Error) {
        errorMsg = error.message;
      }
      message.error(errorMsg);
    } finally {
      setPasswordUpdating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('token_expire');
    message.success('已退出登录');
    navigate('/login');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(120deg, #f4f6fa 0%, #e9efff 100%)',
        position: 'relative'
      }}
    >
      {/* 右上角返回按钮 */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/dashboard')}
        style={{
          position: 'absolute',
          top: 32,
          left: 48,
          zIndex: 10,
          fontWeight: 500,
          background: '#f0f5ff',
          border: '1px solid #d6e4ff',
          borderRadius: 6
        }}
        size="middle"
      >
        返回列表
      </Button>

      <div
        style={{
          maxWidth: 520,
          minWidth: 320,
          margin: '0 auto',
          padding: '64px 24px 32px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 32,
            borderBottom: '1px solid #f0f0f0',
            paddingBottom: 24,
            width: '100%',
            maxWidth: 400
          }}
        >
          <div
            style={{
              marginRight: 32,
              boxShadow: '0 2px 8px #d6e4ff44',
              borderRadius: '50%',
              border: '2px solid #e0e7ff',
              width: 72,
              height: 72,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f4f8ff',
              overflow: 'hidden'
            }}
          >
            <img
              src={user.avatar || 'https://via.placeholder.com/72?text=Avatar'}
              alt="Avatar"
              style={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                objectFit: 'cover'
              }}
            />
          </div>
          <div>
            <Title level={4} style={{ marginBottom: 4, fontWeight: 700, letterSpacing: 1 }}>
              <UserOutlined style={{ marginRight: 7, color: '#1890ff' }} />
              {user.username || '未登录'}
            </Title>
            <Text type="secondary" style={{ fontSize: 13, color: '#888' }}>
              欢迎来到个人中心
            </Text>
          </div>
        </div>
        {/* 竖直排列按钮 */}
        <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 32 }}>
          <Button
            icon={<EditOutlined />}
            onClick={() => setAvatarModalVisible(true)}
            style={{
              fontWeight: 500,
              background: '#e6f7ff',
              border: '1px solid #b5e3fa',
              color: '#1890ff',
              borderRadius: 6,
              boxShadow: 'none',
              transition: 'all 0.2s'
            }}
            size="large"
            block
          >
            修改头像
          </Button>
          <Button
            icon={<LockOutlined />}
            onClick={() => setPasswordModalVisible(true)}
            style={{
              fontWeight: 500,
              background: '#f5f0ff',
              border: '1px solid #d3adf7',
              color: '#722ed1',
              borderRadius: 6,
              boxShadow: 'none',
              transition: 'all 0.2s'
            }}
            size="large"
            block
          >
            修改密码
          </Button>
        </div>
        <div style={{ width: '100%', maxWidth: 400, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            icon={<LogoutOutlined />}
            type="primary"
            danger
            onClick={handleLogout}
            style={{
              width: 120,
              fontWeight: 500,
              background: '#fff1f0',
              color: '#ff4d4f',
              border: '1px solid #ffd6d6',
              borderRadius: 6
            }}
            size="large"
          >
            退出
          </Button>
        </div>
      </div>

      {/* 头像修改弹窗 */}
      <Modal
        title="修改头像"
        open={avatarModalVisible}
        onOk={handleAvatarUpdate}
        onCancel={() => setAvatarModalVisible(false)}
        okText="上传"
        confirmLoading={uploading}
        centered
      >
        <Upload
          beforeUpload={handleBeforeUpload}
          fileList={fileList}
          onRemove={handleRemove}
          accept="image/*"
          maxCount={1}
          showUploadList={true}
          listType="picture"
        >
          <Button icon={<UploadOutlined />}>选择图片</Button>
        </Upload>
      </Modal>

      {/* 密码修改弹窗 */}
      <Modal
        title="修改密码"
        open={passwordModalVisible}
        onOk={handlePasswordUpdate}
        onCancel={() => setPasswordModalVisible(false)}
        okText="保存"
        confirmLoading={passwordUpdating}
        centered
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="旧密码"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="新密码"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default PersonalCenter;
