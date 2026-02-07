# 数字人（Avatar）知识库视频播放机制分析

## 一、总体架构

Nuwa 数字人 Web SDK 采用 **Vue 3 + WebSocket + WebRTC** 架构，在视频播放方面存在两种完全不同的模式：

| 维度 | 实时数字人流（RTC 直播流） | 知识库预录视频播放 |
|------|--------------------------|-------------------|
| **消息类型** | `avator-play`、`avator-connect` | `avator-ctrl` + `cmd:"video_play"` |
| **通信协议** | WHIP/WHEP（WebRTC SDP 协商） | HTTP 视频文件直接下载 |
| **HTML 元素** | `<video id="videoChat">` | `<video id="videoFull">` |
| **视频源设置** | `video.srcObject = rtcStream` | `video.src = url`（通过 Vue 响应式变量 `V.value`） |
| **是否双向** | 是（含语音输入 ASR） | 否（仅播放） |
| **触发条件** | 页面加载后建立 RTC 连接 | 知识库查询命中视频资源时由服务端下发 |

---

## 二、API 调用全流程

### 2.1 认证阶段

```
POST https://api.nuwaai.com/web/apiKey/auth
Body: { secretKey: "sk-xxxxx" }
Response: { code: 0, data: "<token>" }
→ token 存入 localStorage
```

### 2.2 WebSocket 连接建立

认证完成后，SDK 通过 WebSocket 连接到：
```
wss://stdio.nuwaai.com/websk/humanAgent/humanchat/
```

### 2.3 数字人加载与 RTC 流建立

```
avator-load → 加载数字人资源
avator-connect → 建立 RTC 连接（初始化 Recorder 做 ASR 录音）
avator-play → 通过 SDP 协商开始播放实时数字人流
    → 使用 SrsRtcWhipWhepAsync.play2() 方法
    → 通过 WHEP 协议接收 RTC 流
    → video.srcObject = stream（绑定到 videoChat 元素）
```

---

## 三、知识库查询与视频播放的完整流程

### 3.1 用户发送知识库查询

用户在对话中提问时，SDK 通过 WebSocket 发送 `agent` 类型消息：

```javascript
socket.send(JSON.stringify({
  type: "agent",
  token: "123123123123",
  userid: "<用户ID>",
  digitalman_id: "<数字人ID>",
  data: {
    sessionid: "<会话ID>",
    intent: "UNKNOWN",
    content: "<用户问题>",
    knowledgeid: "my_rag_partition",  // 知识库分区标识
    ext: { name: "libai" }
  }
}))
```

### 3.2 服务端响应分发

服务端根据知识库检索结果，返回不同类型的消息：

#### 情况 A：知识库匹配到文本内容

```
服务端发送: { type: "chat_begin" }
服务端发送: { type: "chat", code: 200, data: { content: "..." } }  // 多次流式推送
服务端发送: { type: "chat_over" }
```

客户端处理：
- 累积响应文本 `ke.respText += content`
- 使用 Marked 渲染 Markdown
- 对文档 URL 做转换（API → CDN）
- 渲染到聊天界面

#### 情况 B：知识库匹配到视频资源

```
服务端发送: { type: "avator-ctrl", cmd: "video_play", src: "<视频URL>" }
```

**这是知识库视频播放的核心触发点。**

### 3.3 视频播放处理（核心逻辑）

当客户端收到 `avator-ctrl` + `video_play` 命令时，执行以下逻辑：

```javascript
case "avator-ctrl":
  if ("video_play" == c.cmd) {
    console.log("video_play", c.src);

    // 1. URL 转换：将 API 下载地址转为 CDN 直链
    const videoUrl = c.src.replace(
      "https://api.nuwaai.com/web/document/download?filename=",
      "https://res.nuwaai.com/nuwa/"
    );

    // 2. 设置视频源（Vue 响应式变量）
    V.value = videoUrl;

    // 3. 获取 videoFull 元素并播放
    const videoElement = document.getElementById("videoFull");
    W.value = true;   // 显示视频播放器
    await videoElement.play();  // 开始播放
  }
  else if ("video_stop" == c.cmd) {
    He();  // 停止视频播放
  }
  else if ("pictrue" == c.cmd) {
    // 处理图片展示命令...
  }
```

### 3.4 视频播放结束处理

视频播放结束时（`<video>` 的 `onEnded` 事件），客户端执行：

```javascript
function He() {
  ke.status = 0;      // 重置请求状态
  W.value = false;     // 隐藏视频播放器
  socket.send(JSON.stringify({
    type: "video_play_end"  // 通知服务端视频播放完成
  }));
}
```

---

## 四、URL 转换机制

系统中存在统一的 URL 转换逻辑，将 API 文档下载地址转换为 CDN 资源地址：

| 原始 URL（API） | 转换后 URL（CDN） |
|-----------------|-------------------|
| `https://api.nuwaai.com/web/document/download?filename=xxx.mp4` | `https://res.nuwaai.com/nuwa/xxx.mp4` |

该转换在两处应用：
1. **视频播放**：`avator-ctrl` → `video_play` 命令中的 `src` 字段
2. **聊天内容**：Markdown 渲染后的所有文档 URL（含图片、视频内嵌链接等）

---

## 五、两个 Video 元素的职责

### `<video id="videoChat">` — 实时 RTC 数字人流
- **用途**：展示实时的数字人形象（唇动、表情、动作等）
- **数据源**：WebRTC MediaStream（`srcObject`）
- **属性**：`playsinline`、`webkit-playsinline`、`x5-video-player-type:h5-page`
- **始终存在**：作为数字人的"实时面孔"持续播放

### `<video id="videoFull">` — 知识库预录视频
- **用途**：播放知识库中关联的预录视频内容
- **数据源**：HTTP 视频 URL（通过 `src` 属性）
- **属性**：`autoplay`、`controls`（带播放控件）
- **按需显示**：仅在服务端下发 `video_play` 命令时显示，通过 `W.value` 控制显隐
- **播放结束**：自动触发 `He()` 函数，隐藏播放器并通知服务端

---

## 六、消息类型完整汇总

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| `agent` | 客户端 → 服务端 | 发送用户查询（含知识库 ID） |
| `chat_begin` | 服务端 → 客户端 | 文本响应开始 |
| `chat` | 服务端 → 客户端 | 流式文本内容（Markdown） |
| `chat_over` | 服务端 → 客户端 | 文本响应结束 |
| `avator-load` | 服务端 → 客户端 | 数字人资源加载 |
| `avator-connect` | 服务端 → 客户端 | RTC 连接建立 |
| `avator-play` | 服务端 → 客户端 | RTC 流播放（含 SDP） |
| `avator-playstop` | 服务端 → 客户端 | RTC 流停止 |
| `avator-text` | 服务端 → 客户端 | 数字人文字响应 |
| `avator-ctrl` | 服务端 → 客户端 | 控制命令（video_play/video_stop/pictrue/task） |
| `video_play_end` | 客户端 → 服务端 | 通知视频播放完成 |
| `asr` / `asr-text` / `asr-commit` | 双向 | 语音识别相关 |
| `tts_start` | 服务端 → 客户端 | TTS 语音合成开始 |

---

## 七、关键结论

1. **知识库视频的播放由服务端决定**：客户端不参与判断是否播放视频，完全依赖服务端在收到 `agent` 查询后返回 `avator-ctrl` + `video_play` 命令。

2. **视频来源是知识库文档**：视频文件存储在 `res.nuwaai.com/nuwa/` CDN 上，与文档管理系统共用同一个资源路径，通过 API 地址到 CDN 地址的转换实现快速访问。

3. **两套视频系统互相独立**：RTC 实时流（`videoChat`）和预录视频（`videoFull`）是两套完全独立的播放机制，互不干扰。知识库视频播放时可能会覆盖在 RTC 流之上。

4. **生命周期管理**：视频播放有完整的生命周期：`video_play` → 播放 → `onEnded` → `video_play_end` 通知服务端，形成闭环。

5. **统一的 URL 转换策略**：所有来自知识库的资源（文档、图片、视频）都经过相同的 URL 转换逻辑，从 API 下载路径转为 CDN 直链，以提升加载性能。
