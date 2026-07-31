# AI生意经视频工厂

这是“AI生意经”的批量短视频生产系统。它把案例事实、脚本、配音、素材、HyperFrames渲染和质量检查固化为可复现的Cloudflare流水线。

## 架构

- Workers + 静态后台：生产控制台与API
- Workflows：长任务、步骤状态和自动重试
- Workers AI：脚本生成与Whisper反向校对
- DeepSeek：脚本生成的备用通道
- Containers：HyperFrames、Chromium、FFmpeg和Edge Neural TTS
- R2：案例快照、脚本、音频、MP4、联系表和质检报告
- D1：任务、事件和模板版本
- 每日计划任务：自动挑选2个尚未生产、拥有3项以上素材的案例

二进制成片存入R2，不进入Git仓库。GitHub只保存可审计的模板、规则、Schema和部署代码。

## 质量门

1. 至少3项不同原始素材，且通过下载、尺寸、解码和低熵检查。
2. 脚本的每段事实绑定案例`evidenceIds`，素材绑定`mediaIds`。
3. 中文旁白按语义短句生成，字幕直接使用最终配音短句。
4. 1080×1920、30fps、H.264/AAC、含有效音轨。
5. 约-16 LUFS、True Peak不高于-1.5dB附近。
6. 无连续黑帧，成片时长与音频一致。
7. Whisper反向转写与脚本文字达到阈值；不通过自动降速重做一次。

控制台支持每批1至50个案例ID。自动批量大小由`AUTO_BATCH_SIZE`配置，设为`0`即可暂停每日自动生产。

## 本地开发

需要Node.js 22+、Docker和Cloudflare账号。

```bash
npm install
npm test
npm run typecheck
npm run db:local
npm run dev
```

## 部署

首次部署前设置两个密钥：

```bash
npx wrangler secret put FACTORY_ADMIN_TOKEN
npx wrangler secret put INTERNAL_RENDER_TOKEN
npx wrangler secret put DEEPSEEK_API_KEY  # 可选
npm run deploy
npm run db:remote
```

生产后台对外可访问，但所有生产API都必须携带`X-Factory-Key`。主站无需恢复用户登录系统。
