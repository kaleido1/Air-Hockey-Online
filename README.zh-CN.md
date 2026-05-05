# Air Hockey Online

[English](./README.md) | [中文](./README.zh-CN.md)

<p align="center">
  <a href="https://discord.gg/PVx9PXAZyb">
    <img src="https://img.shields.io/badge/Discord-%E5%8A%A0%E5%85%A5%E7%A4%BE%E7%BE%A4-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="加入 Air Hockey Online Discord 服务器">
  </a>
</p>

Air Hockey Online 是一个面向浏览器的街机风气垫球游戏，重点强调手机、平板、桌面多端可玩，以及接近竞技游戏手感的快速对战体验。项目支持单人练习、本机双人、局域网无线双人，以及在线双人联机。

立即体验：

https://air-hockey-online-kaleido1.onrender.com/

## 游玩方法

> 快速上手
>
> - 触控设备双击屏幕中间区域可暂停或继续游戏。
> - 电脑设备按 `Space` 可暂停或继续游戏。
> - 在本机双人模式下，按 `C` 可以在下方球拍和上方球拍之间切换控制。
> - iOS 设备需要点击一次游戏内声音提示，用来开始本局并解锁游戏音频。

## 多端支持

- 支持手机、平板和桌面浏览器游玩。
- 以触屏操作为优先，同时兼顾不同屏幕尺寸和不同刷新率设备。
- 本地、无线、在线三种模式共用一致的游戏规则与对局流程。
- 内置中英文界面切换，适合不同语言环境下直接游玩。
- 针对 iOS Safari 与添加到主屏幕后的 Web App 场景处理声音解锁。

## 双人联机

### 无线双人

无线双人模式面向同一局域网中的设备。两台附近设备可以快速加入并开始对战，不需要公开房间链接。

### 在线双人

在线双人模式支持异地联机。玩家可以创建房间、通过房间号加入、重连、离开房间。Node 服务端继续负责房间、匹配和 WebRTC 信令，真正对局中的实时数据通过 WebRTC DataChannel 传输，并支持 TURN 服务器用于 NAT 穿透。

## 已实现的 Features

- 单人练习模式，内置强化后的 AI，对防守、节奏变化和偷袭线路都有处理。
- 本机双人模式，支持多点触控。
- 无线双人模式，适合同一网络环境下的设备快速对战。
- 在线双人模式，支持快速匹配、房间创建、房间号加入、重连、重开和离开流程。
- 支持单冰球与双冰球对局。
- 使用 WebRTC DataChannel 进行实时对战，并由房主浏览器运行权威物理循环。
- 面向竞技体验优化的快速碰撞响应，并包含卡球救援与更安全的发球位置选择。
- WebSocket 用于房间、匹配、重连、WebRTC offer/answer 和 ICE candidate 信令。
- 先到 7 分的比赛规则，以及暂停、进球、结算、重开、返回主菜单等完整流程。
- 使用 Web Audio 生成游戏音效，并为 iOS 保留 canvas 内声音解锁提示。
- 直接浏览器打开即可游玩，适配触屏设备。

## 技术实现

- 基于 Node.js 的 HTTP 服务与轻量级 WebSocket 实现。
- 在线和无线双人使用 WebRTC DataChannel，WebSocket 保留为房间信令通道。
- 通过 `AIR_HOCKEY_TURN_CREDENTIALS_URL` 加载 TURN 凭证，支持 Metered 返回的 ICE server 配置。
- 使用 Canvas 渲染球桌、冰球、球拍、界面和覆盖层。
- 通过 `public/offline-physics.js` 复用浏览器端核心物理辅助逻辑。
- 使用 Matter.js 处理本地/离线物理步进和本地冰球预测辅助。
- 使用 SAT 圆形碰撞辅助，提高冰球与球拍接触解析的稳定性。
- 使用程序化 Web Audio 生成音效，并支持音频会话恢复与 iOS inline media 解锁。
- 支持中英文界面、浏览器端多人房间流程管理，以及语言/声音偏好的本地保存。

## 本地开发

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:3100/`。

常用检查：

```bash
npm run check
npm test
```

免费部署配置见 [Free Render Deployment](./docs/free-webrtc-render.md)。

## WebRTC、TURN 与 Metered

在线和无线双人模式使用 WebRTC DataChannel 传输实时对局数据。Node 服务端仍然负责页面托管和 `/ws` 信令，但当两个浏览器建立连接后，不再需要服务端转发每一个实时游戏包。

为了在 NAT、移动网络和复杂路由环境下更稳定连接，需要配置 TURN 凭证 URL：

```bash
AIR_HOCKEY_TURN_CREDENTIALS_URL="https://<appname>.metered.live/api/v1/turn/credentials?apiKey=<credential-api-key>"
```

如果使用 Metered，可以在 Metered 控制台创建 TURN credential，复制 credential API key，并把 `<appname>` 替换成你的 Metered app 名称。Render 中应把这个完整 URL 配成环境变量，不要写入仓库。

部署后可以这样检查：

```bash
curl -s https://air-hockey-online-kaleido1.onrender.com/healthz
```

TURN 正常时应看到类似字段：

```json
{"turnConfigured":true,"turnFetchOk":true,"iceServerCount":5}
```

浏览器只会请求 `/turn-credentials` 获取规范化后的 ICE servers；原始 Metered URL 只保留在服务端环境变量中。

## License

本项目采用 [MIT License](./LICENSE) 开源。

部分视觉或设计参考元素可能附带额外的非商用限制，详见
[NOTICE](./NOTICE)。
