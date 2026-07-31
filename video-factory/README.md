# AI生意经视频工厂

这是“AI生意经”的批量短视频生产系统。它把案例事实、脚本、配音、素材、HyperFrames渲染和质量检查固化为可复现的Cloudflare流水线。

## 架构

- Workers + 静态后台：生产控制台与API
- Workflows：长任务、步骤状态和自动重试
- Workers AI：脚本生成与Whisper反向校对
- DeepSeek：脚本生成的备用通道
- Containers：HyperFrames、Chromium、FFmpeg和Edge Neural TTS
- R2：案例快照、脚本、音频、MP4、联系表和质检报告的短期中转缓存
- D1：任务、事件和模板版本
- 每日计划任务：自动挑选2个尚未生产、拥有3项以上素材的案例

二进制成片不进入Git仓库。云端成片默认在R2保留3天，用户可从生产台下载到本机，确认保存后立即点击“释放云端缓存”；每日计划任务也会自动清理到期文件。以每天2条、每条约100–150MB估算，3天滚动缓存通常低于1GB。

案例库直接读取`data/case_articles/{caseId}.json`，3646个案例均使用各自的详情事实与3–5份素材，不再只依赖5个正式样例组成的汇总文件。

## 质量门

1. 至少3项不同原始素材，且通过下载、尺寸、解码和低熵检查。
2. 脚本的每段事实绑定案例`evidenceIds`，素材绑定`mediaIds`。
3. 中文旁白按语义短句生成，字幕直接使用最终配音短句。
4. 1080×1920、30fps、H.264/AAC、含有效音轨。
5. 约-16 LUFS、True Peak不高于-1.5dB附近。
6. 无连续黑帧，成片时长与音频一致。
7. Whisper反向转写与脚本文字达到阈值；不通过自动降速重做一次。

生产台支持案例名称与分类搜索、可视化选择、批量导入ID、生产进度、失败重试、成片预览、本地下载、质检报告和云端缓存释放。自动批量大小由`AUTO_BATCH_SIZE`配置，设为`0`即可暂停每日自动生产；缓存天数由`ARTIFACT_RETENTION_DAYS`配置。

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
