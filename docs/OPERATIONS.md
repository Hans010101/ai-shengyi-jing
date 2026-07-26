# AI生意经运维基线

最后更新：2026-07-26

## 生产基线

| 项目 | 配置 |
|---|---|
| GitHub 仓库 | `Hans010101/ai-shengyi-jing` |
| 默认/生产分支 | `main` |
| Cloudflare Pages 项目 | `ai-shengyi-jing` |
| 生产地址 | `https://ai-shengyi-jing.pages.dev` |
| 自定义域 | 暂无 |
| Pages Git 直连 | 未启用 |
| 发布方式 | GitHub Actions + Wrangler |
| 发布目录 | `dist/` |
| 生产环境变量/绑定 | 无 |

## 发布边界

`scripts/build_site.py` 只允许以下文件进入 `dist/`：

```text
index.html
assets/app.js
assets/style.css
data/projects.js
data/projects_live.json
```

任何新增的公开文件必须显式加入 `PUBLISH_PATHS`，并通过测试确认。禁止直接执行 `wrangler pages deploy .`，因为仓库包含采集脚本、工作流、内容草稿和内部状态数据。

## 正常发布流程

```text
功能或数据变更
  → GitHub main
  → 数据校验
  → 最小站点构建
  → Wrangler 上传 dist/
  → Cloudflare Pages
```

普通维护通过 PR 合并到 `main` 触发。每日采集由 `每日项目采集` 工作流提交数据；该工作流完成后，`workflow_run` 事件会部署最新的 `main`。这样不依赖 GitHub Token 生成的提交再次触发 `push` 工作流。

## 部署前检查

```bash
python3 scripts/validate_data.py data/projects_live.json
python3 -m unittest discover -s tests -v
python3 scripts/build_site.py --output dist
find dist -type f | sort
```

验收要求：

- 数据 JSON 合法且项目 ID 唯一；
- 回归测试全部通过；
- `dist/` 恰好包含预期的 5 个文件；
- 不包含 `.github/`、`.wrangler/`、`pipeline/` 或内容草稿。

## 每日采集

计划时间：每天 UTC 01:00，即中国标准时间 09:00。

采集状态由两个来源共同判断：

1. `data/projects_live.json` 中已有的项目 ID；
2. `pipeline/data/seen_ids.json` 中已处理的项目 ID。

数据库是最终事实来源。写入时新项目优先，并按 ID 去重。流水线必须同时提交数据库和 `seen_ids.json`。

## 故障处理

### Cloudflare 返回认证错误 10000

1. 确认 GitHub Secrets 中两个 Cloudflare 配置均存在；
2. 确认 Repository variable `CLOUDFLARE_ACCOUNT_ID` 和 Repository secret `CLOUDFLARE_API_TOKEN` 均可用；
3. Token 至少需要该账户的 Cloudflare Pages 编辑权限；
4. 在功能分支手动触发部署工作流，先验证预览部署；
5. 不要在日志、仓库或 Issue 中粘贴 Token。

### 每日采集成功但生产数据未更新

1. 检查 `每日项目采集` 是否成功；
2. 检查随后产生的 `自动部署到 Cloudflare Pages` workflow run；
3. 确认部署工作流 checkout 的是最新 `main`；
4. 比较线上 `data/projects_live.json` 与仓库文件的项目数量。

### 数据出现重复 ID

```bash
python3 scripts/repair_project_data.py
python3 scripts/validate_data.py data/projects_live.json
```

修复后检查差异，只提交预期的数据和 `seen_ids.json` 变化。

## 回滚

优先使用 Git 回滚，避免让 Cloudflare 与仓库长期分叉：

1. 对问题提交创建 `git revert`；
2. 合并到 `main`；
3. 等待部署工作流完成；
4. 验证生产 URL 和数据库数量。

紧急情况下可在 Cloudflare Pages 中回滚到上一成功部署，但随后仍需在 GitHub 中修复并重新部署，使两边恢复一致。

## 密钥与权限

- 密钥只保存在 GitHub Actions Secrets 或 Cloudflare 的受控配置中；
- Cloudflare Account ID 不是密钥，保存在 GitHub Repository variables 中；
- 仓库内只记录密钥名称，不记录值；
- `.wrangler/` 是本地缓存，已加入 `.gitignore`；
- 更新 Token 后必须通过一次预览部署验证权限。
