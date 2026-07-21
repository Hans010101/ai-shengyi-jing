# 💡 AI生意经

> 发现全球最赚钱的生意模型，以中国创业者视角深度解读

## 🚀 项目概述

**AI生意经** 是一个以 Starter Story (starterstory.com) 为数据源，向中国创业者输出全球热门盈利项目解读的内容平台。

## 📁 项目结构

```
ai-shengyi-jing/
├── index.html              # 主网站
├── assets/
│   ├── style.css           # 全局样式（暗色主题）
│   └── app.js              # 前端逻辑（搜索/筛选/弹窗）
├── data/
│   └── projects.js         # 精选项目数据库（15个案例）
├── pipeline/
│   └── scraper.py          # 自动化采集流水线
└── README.md
```

## ✨ 功能特性

### 网站端
- 🔍 实时搜索 + 多维度筛选（类别/排序）
- 📊 项目卡片展示（营收/启动成本/可复制指数）
- 🪟 详情弹窗（AI解读 + 中国机会分析 + 技术栈）
- 📱 响应式设计，手机端完美适配
- ⚡ 流畅动画与微交互

### 自动化流水线
- 🕷️ 每日采集 Starter Story 新项目
- 🤖 AI自动生成中文解读（支持 GPT-4o / Gemini）
- 📝 自动输出微信公众号草稿 + 小红书图文草稿
- 🗄️ 去重存储，增量更新

## 🏃 快速开始

### 运行网站
```bash
# 直接用浏览器打开
open index.html

# 或启动本地服务器
python3 -m http.server 8080
# 访问 http://localhost:8080
```

### 运行采集流水线
```bash
cd pipeline

# 安装依赖
pip install requests beautifulsoup4 openai

# 配置 API Key（二选一）
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="AIza..."

# 运行
python3 scraper.py
```

### 设置定时任务（每日9点运行）
```bash
crontab -e
# 添加：
0 9 * * * cd /path/to/ai-shengyi-jing/pipeline && python3 scraper.py >> logs/daily.log 2>&1
```

## 📊 数据说明

目前预置 **15 个精选案例**，涵盖：
- AI工具 / Micro-SaaS / 无代码工具
- 内容创业 / 知识付费 / Newsletter
- 本地服务 / 效率工具 / B2B SaaS

每个案例包含：
- 月营收（MRR）、启动成本、首次盈利时间
- AI生意经中文解读（创意亮点 + 商业模式）
- 🇨🇳 中国机会分析（本土化建议）
- 可复制指数（1-10分）

## 🗺️ 下一步计划

| 阶段 | 功能 | 状态 |
|------|------|------|
| MVP | 网站 + 15个精选案例 | ✅ 完成 |
| Phase 2 | 公众号 + 小红书内容发布 | 🚧 进行中 |
| Phase 3 | 自动化流水线全量上线 | 📋 规划中 |
| Phase 4 | 付费社群 + 订阅变现 | 📋 规划中 |

## ⚠️ 合规说明

- 本平台内容为**原创中文解读**，非Starter Story原文翻译
- 数据采集遵守 robots.txt 协议，添加合理延迟
- 所有案例均注明原始来源
- 商业使用请遵守相关法律法规

## 📞 联系

- 公众号：AI生意经（建设中）
- 小红书：AI生意经
- 邮件：hello@ai-shengyi-jing.com（占位）
