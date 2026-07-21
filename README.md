# OW Map Ban Pick Page

一个使用 Python Flask + TypeScript 构建的守望先锋赛事地图与 Ban Pick 可视化页面。每个比赛房间拥有红队、蓝队、房间管理员和直播四个独立入口。

## 本地运行

```bash
python -m pip install -r requirements.txt
npm install
npm run build
python backend/app.py
```

打开 <http://127.0.0.1:5174/> 创建房间。每个新房间会生成一个 4 位房间 ID，以及 A/B/C/D 四个由 `0-9a-z` 组成的 4 位入口码。

Flask 启动时会在控制台打印全局管理地址。管理页可以关闭活动房间、修改默认设置，并查看或下载永久房间历史 JSON。

全局管理页的“英雄与地图数据”区域可以从英文 Fandom 更新当前英雄、头像、职责图标，以及 Escort、Hybrid、Control、Push、Flashpoint 五类地图和图片。更新先在临时目录完成，失败时继续使用上一版完整目录；运行期数据保存在 `backend/data/runtime/catalog/`，容器重建后仍会保留。

每次成功爬取都会生成并尝试复制一份英文到中文的映射模板。中文映射的格式为 `schemaVersion`、`catalogHash`、`modes`、`maps`、`heroes`；只有哈希、键集合和所有中文值完整匹配时才启用中文，否则所有目录名称统一显示英文。爬取不会覆盖管理员保存的映射。

仓库维护者也可手动刷新内置清单和静态资源，供全新部署及 Sites 只读展示版使用：

```bash
python scripts/scrape_assets.py
```

## Docker 运行

前后端会被打包进同一个镜像，容器内由 Flask/Gunicorn 提供页面、API 和静态资源：

```bash
docker compose up -d --build
```

打开 <http://127.0.0.1:5175/>。

当代码 push 后，GitHub Actions 会构建并推送 GHCR 镜像。若要在本机同步当前分支并重启本地容器：

```powershell
.\scripts\update_container.ps1
```

开发前端时可同时运行：

```bash
python backend/app.py
npm run dev
```

然后打开 <http://127.0.0.1:5173/>，Vite 会代理 API 与静态占位图到 Flask。

## 房间数据与历史

- `backend/data/runtime/rooms.json` 仅保存当前活动房间、全局设置和创建频率记录。
- 每个房间从创建开始都会维护 `backend/data/runtime/room_history/A码-B码-C码-D码.json`。
- 历史文件记录创建、每次成功的版本化状态操作、手动关闭或超时归档；不会自动裁剪或删除。
- 手动关闭或超过“不活跃关闭分钟数”后，房间会先归档，再从活动索引移除并释放房间 ID 和四个入口码。
- 单个短码允许被新房间复用，但完整 A/B/C/D 组合不会再次生成，因此历史文件不会被覆盖。
- Docker Compose 已将整个 `backend/data/runtime` 目录挂载到宿主机，容器重建不会清除历史。

## 比赛配置模板

- 全局管理员可以在管理页面用 GUI 新建、修改、删除杯赛模板，也可以粘贴完整 JSON 导入。
- 模板持久保存在 `backend/data/runtime/config_presets/`；房间导入模板时会复制独立配置，模板后续更新不会影响已有房间。
- 房间管理员可在赛前选择模板、手动调整或使用高级 JSON 导入。配置确认并开始比赛后由后端锁定。
- 如需修改已开赛配置，必须“回退到赛前配置”，该操作会清除地图、阵容、Ban、比分和比赛进度。
- 完整示例、机器可读字段说明和中文指南位于 `static/config/`。

4 位入口码便于人工传递，但可枚举空间较小。全局管理员入口仍使用长随机哈希；若部署到不可信公网，应在反向代理层增加访问控制和请求限流。

## 验证

```bash
npm run test:backend
npm run build
npm run test:e2e
```

Playwright 默认访问 <http://127.0.0.1:5175>，运行端到端测试前需要先启动 Docker Compose 服务，或通过 `BASE_URL` 指向已经运行的实例。

