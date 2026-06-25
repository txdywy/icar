# 🚗 iCar — 智能汽车数据查询平台

搜索任意车型，获取实时价格、配置参数、落地价计算。

## 架构

```
┌──────────────────┐     ┌──────────────────────────┐     ┌──────────────┐
│   GitHub Pages   │────▶│   Cloudflare Worker       │────▶│  Firecrawl   │
│   (纯静态前端)    │◀────│   (CORS 代理 + 价格计算)   │◀────│  → 懂车帝     │
└──────────────────┘     └──────────────────────────┘     └──────────────┘
```

- **前端**：纯 HTML/CSS/JS，零框架依赖
- **后端**：Cloudflare Worker（免费 10万请求/天）
- **数据**：Firecrawl 抓取懂车帝页面，绕过反爬虫保护
- **部署**：GitHub Actions → GitHub Pages

## 功能

- 🔍 智能搜索：输入车型关键词，实时搜索懂车帝数据库
- 💰 价格查询：厂商指导价 + 经销商报价
- 📊 落地价计算：购置税 + 保险 + 上牌费，一键计算
- 📋 车型列表：各年款在售/停售车型一览
- 🔥 热门车型：一键查看主流热销车
- ⚡ 新能源标识：纯电动车型购置税自动免征

## 快速开始

### 1. 获取 Firecrawl API Key

注册 [Firecrawl](https://firecrawl.dev) 获取 API Key（免费额度即可）。

### 2. 部署 Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login

# 设置 Firecrawl API Key 为 Worker secret
npx wrangler secret put FIRECRAWL_API_KEY
# 粘贴你的 Firecrawl API Key

# 部署
npx wrangler deploy
```

部署后记录 Worker URL（如 `https://icar-worker.xxx.workers.dev`）。

### 3. 配置前端 API 地址

编辑 `src/js/app.js`，修改 `CONFIG.API_BASE`：

```js
API_BASE: "https://icar-worker.xxx.workers.dev",
```

### 4. 启用 GitHub Pages

1. 进入仓库 Settings → Pages
2. Source 选择 "GitHub Actions"
3. 推送代码后自动部署

### 5. 本地开发

```bash
# Terminal 1: 启动 Worker
cd worker && npx wrangler dev

# Terminal 2: 启动前端
python3 -m http.server 8090
```

访问 `http://localhost:8090`

## 项目结构

```
icar/
├── index.html              # 主页面
├── src/
│   ├── css/style.css       # 样式
│   └── js/app.js           # 前端逻辑
├── worker/
│   ├── index.js            # Cloudflare Worker (Firecrawl 代理)
│   ├── wrangler.toml       # Worker 配置
│   └── package.json
└── .github/workflows/
    └── deploy.yml          # GitHub Pages 部署
```

## API Endpoints

| 端点 | 说明 | 参数 |
|------|------|------|
| `GET /api/search?q=` | 搜索车型 | `q` 关键词 |
| `GET /api/series/:id` | 车系详情 + 落地价 | `id` 懂车帝车系ID |
| `GET /api/health` | 健康检查 | — |

## 数据来源

通过 Firecrawl 抓取懂车帝公开页面数据，仅供学习参考。如用于商业用途，请自行确认数据授权。

## License

MIT
