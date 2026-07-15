# 比赛配置 JSON 使用说明

完整可导入示例见 `match-config.example.json`，所有字段的类型、枚举、范围和中文说明见 `match-config.schema.json`。

全局管理员可以在“配置模板”页面粘贴完整 JSON，新建或覆盖模板。房间管理员可以在赛前设置页的“高级 JSON 导入”中粘贴完整模板，也可以只粘贴其中的 `config` 对象。导入只会复制配置，不会让房间持续引用全局模板。

## 重要规则

- `matchFormat` 为 `ft2`、`ft3`、`ft4` 时，`stageCount` 必须分别为 3、5、7。
- 所有阶段时间以秒为单位，必须是 1–3600 的整数。
- `mapPool` 中的类别和英文地图名称必须存在于网站地图目录。
- 使用 `fixed_map_order` 时，`fixedMapOrderText` 每行一张地图，并且至少包含 `stageCount` 张。
- 模板导入房间后成为独立副本。全局模板后续修改不会影响已创建房间。
- 比赛开始后配置被后端锁定。只有“回退到赛前配置”并清空比赛进度后才能继续修改。

## 顶层字段

- `schemaVersion`：当前固定为 `1`。
- `id`：模板稳定标识，只允许小写字母、数字、`_` 和 `-`。
- `name`：界面显示名称，例如“杯赛 A”。
- `description`：模板用途和主要规则简介。
- `config`：实际比赛规则，完整字段请查看 Schema 中 `$defs.config.properties`。
