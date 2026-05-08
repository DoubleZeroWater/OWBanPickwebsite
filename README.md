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

地图图片来自 Liquipedia Overwatch 地图页，可按需重新抓取：

```bash
python3 scripts/scrape_liquipedia_maps.py
```

开发前端时可同时运行：

```bash
python backend/app.py
npm run dev
```

然后打开 <http://127.0.0.1:5173/A>，Vite 会代理 API 与静态占位图到 Flask。

