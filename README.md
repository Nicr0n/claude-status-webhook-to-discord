# Claude Status → Discord Webhook

一个 Cloudflare Worker，把 [status.claude.com](https://status.claude.com)（Atlassian Statuspage）的 webhook 通知转换成 Discord webhook 能识别的 embed 消息。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Nicr0n/claude-status-webhook-to-discord)

## 效果

| 事件 | Discord 消息 |
| --- | --- |
| 事故 (incident) 新建 / 更新 | 标题链接到事故页，正文为最新一条更新；字段显示状态、影响级别、受影响组件；颜色随影响级别变化，解决后变绿 |
| 计划维护 (scheduled maintenance) | 蓝色，显示维护起止时间（按查看者本地时区） |
| 组件状态变化 | 如 `Claude API: 🟢 Operational → 🟠 Partial outage` |

无法识别的请求返回 `202` 并被忽略，不会转发。

## 部署

### 一键部署

点击上方 **Deploy to Cloudflare** 按钮，登录 Cloudflare 后按提示操作即可。Cloudflare 会把本仓库复制到你的 GitHub 账号并自动构建部署。

### 手动部署

```bash
git clone https://github.com/Nicr0n/claude-status-webhook-to-discord.git
cd claude-status-webhook-to-discord
npm install
npx wrangler login
npm run deploy
```

部署完成后会得到一个地址，例如 `https://claude-status-to-discord.<你的子域>.workers.dev`。

## 使用

1. 在 Discord 频道 **设置 → 整合 → Webhook** 新建 webhook，复制 URL：
   ```
   https://discord.com/api/webhooks/<id>/<token>
   ```
2. 把域名替换成你的 Worker 地址：
   ```
   https://claude-status-to-discord.<你的子域>.workers.dev/api/webhooks/<id>/<token>
   ```
   需要发到论坛帖子 / 子区时，追加 `?thread_id=<线程 ID>`。
3. 打开 [status.claude.com](https://status.claude.com) → **Subscribe to updates** → **Webhook**，填入上一步的 URL 和你的邮箱。

> ⚠️ Worker 不存储任何密钥，Discord webhook 的 ID 和 token 就在路径里。请把这个 URL 当作密码保管。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/` | 返回使用说明 |
| `POST` | `/api/webhooks/:id/:token` | 接收 Statuspage webhook，转换后转发到 `https://discord.com/api/webhooks/:id/:token` |

响应码：`200` 转发成功；`202` 无法识别的请求，已忽略；`400` 请求体不是 JSON；`404` 路径不对；`502` Discord 返回错误（响应体包含 Discord 的错误信息）。

## 本地开发

```bash
npm install
npm run dev
```

用示例 payload 测试：

```bash
curl -X POST http://localhost:8787/api/webhooks/<id>/<token> \
  -H 'content-type: application/json' \
  -d '{
    "incident": {
      "id": "abc",
      "name": "Elevated errors on Claude API",
      "status": "investigating",
      "impact": "major",
      "shortlink": "https://stspg.io/xyz",
      "components": [{ "name": "Claude API" }],
      "incident_updates": [
        { "status": "investigating", "body": "We are investigating.", "created_at": "2026-10-24T01:00:00Z" }
      ]
    }
  }'
```

## License

MIT
