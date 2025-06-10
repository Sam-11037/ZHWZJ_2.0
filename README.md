# 实时协同文档编辑器

# 一、本地启动方式

## 1.前置要求

本项目基于node+react开发

所以，对于想在本地启动本项目的用户，请提前配置好node.js的环境，下载地址为 https://nodejs.org/en/

## 2.安装依赖

在根目录终端中 先输入 npm install 在项目根目录下下载依赖

之后输入 cd client 进入前端

再次输入 npm install 在前端中下载依赖

之后进入server文件夹 先 cd .. 退回根目录 后 cd sever进入后端

继续输入 npm install

如果你在3个文件夹中都输入了指令 npm install 恭喜你 所有的依赖已经下载完成

## 3.项目启动

### 关于使用的数据库

项目默认连接的mongoDB云数据库可在\server\.env文件中查看 如果您愿意 也可自行修改成其他数据库或本地数据库

### 启动方式

在终端中，确保目前处于项目根目录下，输入 npm run dev 即可启动编辑器

第一次启动所需要的时间会比较长 请耐心等待 不要关闭自动弹出的浏览器页面 http://localhost:3000，

最终会刷新出一个登录窗口 之后用户即可根据提示自行使用编辑器

需要注意的是 这种启动方式可以同时启动前后端 也是我们推荐您采用的启动方式

# 二、项目结构

项目采用前后端分离的架构，主要分为client（前端）和server（后端）两个主要部分：

## 前端结构 (client/)
```
client/
├── src/                    # 源代码目录
│   ├── App.tsx            # 应用主组件
│   ├── Dashboard.tsx      # 仪表盘组件
│   ├── DocumentEditor.tsx # 文档编辑器组件
│   ├── LoginPage.tsx      # 登录页面
│   ├── RegisterPage.tsx   # 注册页面
│   ├── PersonalCenter.tsx # 个人中心
│   ├── api.ts             # API接口封装
│   ├── yjs-setup.ts       # Yjs协同编辑配置
│   └── types/             # TypeScript类型定义
├── public/                # 静态资源目录
└── package.json          # 前端依赖配置
```

## 后端结构 (server/)
```
server/
├── models/               # 数据模型
│   ├── User.js          # 用户模型
│   └── Document.js      # 文档模型
├── uploads/             # 文件上传目录
├── server.js            # 主服务器文件
├── y-websocket-server.js # WebSocket服务器配置
└── package.json         # 后端依赖配置
```

## 主要功能模块

1. 用户系统
   - 用户注册
   - 用户登录
   - 个人中心

2. 文档系统
   - 文档创建
   - 文档编辑
   - 实时协同
   - 文档管理

3. 实时协同
   - 基于Yjs的实时协同编辑
   - WebSocket实时通信
   - 冲突解决

4. 文件系统
   - 文件上传
   - 文件存储
   - 文件管理

# 三、技术栈

## 前端技术
- React 18.x
- TypeScript
- Yjs (实时协同编辑框架)
- WebSocket
- CSS3

## 后端技术
- Node.js
- Express
- MongoDB
- WebSocket
- JWT认证

# 四、开发环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0
- MongoDB >= 4.0.0
- 现代浏览器（Chrome、Firefox、Safari、Edge等）

# 五、常见问题（FAQ）

1. Q: 为什么我的编辑器无法实时同步？
   A: 请检查以下几点：
   - 确保WebSocket服务器正常运行
   - 检查网络连接是否稳定
   - 确认浏览器是否支持WebSocket

2. Q: 如何解决依赖安装失败的问题？
   A: 可以尝试以下方法：
   - 清除npm缓存：`npm cache clean --force`
   - 删除node_modules文件夹后重新安装
   - 使用`npm install --legacy-peer-deps`安装依赖

3. Q: 如何修改数据库连接？
   A: 在server/.env文件中修改MongoDB连接字符串即可


# 六、联系方式

如有问题或建议，请通过以下方式联系我们：
- 发送邮件至：[1694415365@qq.com]
