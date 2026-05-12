# OW Map Ban Pick Page

一个使用 Python Flask + TypeScript 构建的守望先锋赛事方地图与 Ban Pick 可视化页面。

## 本地运行

```bash
python -m pip install -r requirements.txt
npm install
npm run build
python backend/app.py
```

打开 <http://127.0.0.1:5174/A> 查看赛事方主页面。

地图图片、地图模式图标、英雄头像会在 Flask 启动前通过 `scripts/scrape_assets.py` 自动刷新，也可按需手动重新抓取：

```bash
python scripts/scrape_assets.py
```

## Docker 运行

前后端会被打包进同一个镜像，容器内由 Flask/Gunicorn 提供页面、API 和静态资源：

```bash
docker compose up -d --build
```

打开 <http://127.0.0.1:5175/A>。

当代码 push 后，GitHub Actions 会构建并推送 GHCR 镜像。若要在本机同步当前分支并重启本地容器：

```powershell
.\scripts\update_container.ps1
```

开发前端时可同时运行：

```bash
python backend/app.py
npm run dev
```

然后打开 <http://127.0.0.1:5173/A>，Vite 会代理 API 与静态占位图到 Flask。

