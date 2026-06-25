# 🚗 iCar — 智能汽车数据查询平台

搜索任意车型，获取实时价格、配置参数、落地价计算。

## 架构

```
┌──────────────────┐     ┌──────────────────────────┐     ┌──────────────┐
│   GitHub Pages   │────▶│   Cloudflare Worker       │────▶│  懂车帝 API  │
│   (纯静态前端)    │◀────│   (CORS 代理 + 数据聚合)   │◀────│  车型数据库   │
└──────────────────┘     └──────────────────────────┘     └──────────────┘
```

- **前端**：纯 HTML/CSS/JS，零框架依赖
- **后端**：Cloudflare Worker（免费额度：10万请求/天）
- **数据**：懂车帝公开 API（车型、配置、价格）
- **部署**：GitHub Actions → GitHub Pages

## 功能

- 🔍 智能搜索：输入车型关键词，实时联想推荐
- 💰 价格查询：厂商指导价 + 经销商报价
- 📊 落地价计算：购置税 + 保险 + 上牌费，一键计算
- 📋 配置对比：多车型参数横向对比表
- 🔥 热门车型：一键查看主流热销车

## 快速开始

### 1. 部署 Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

部署后记录 Worker URL（如 `https://icar-worker.xxx.workers.dev`）。

### 2. 配置前端 API 地址

编辑 `src/js/app.js`，修改 `CONFIG.API_BASE` 为你的 Worker URL：

```js
API_BASE: "https://icar-worker.xxx.workers.dev",
```

### 3. 启用 GitHub Pages

1. 进入仓库 Settings → Pages
2. Source 选择 "GitHub Actions"
3. 推送代码后自动部署

### 4. 本地开发

```bash
# Terminal 1: 启动 Worker
cd worker && npm run dev

# Terminal 2: 启动前端（任意 HTTP 服务器）
python3 -m http.server 8080
# 或
npx serve .
```

访问 `http://localhost:8080`

## 项目结构

```
icar/
├── index.html              # 主页面
├── src/
│   ├── css/style.css       # 样式
│   └── js/app.js           # 前端逻辑
├── worker/
│   ├── index.js            # Cloudflare Worker
│   ├── wrangler.toml       # Worker 配置
│   └── package.json
└── .github/workflows/
    └── deploy.yml          # GitHub Pages 部署
```

## API Endpoints

| 端点 | 说明 | 参数 |
|------|------|------|
| `GET /api/search?q=` | 搜索车型 | `q` 关键词 |
| `GET /api/series/:id` | 车系详情 | `id` 车系ID |
| `GET /api/config/:id` | 配置参数 | `id` 车系ID |
| `GET /api/car/:id` | 单车信息 | `id` 车型ID |
| `GET /api/health` | 健康检查 | — |

## 数据来源

数据来自懂车帝公开 API，仅供学习参考。如用于商业用途，请自行确认数据授权。

## License

MIT
