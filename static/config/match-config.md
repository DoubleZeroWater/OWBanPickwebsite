# 比赛配置 JSON 使用说明

完整示例见 `match-config.example.json`，字段约束见 `match-config.schema.json`，完整业务语义见 `docs/TARGET_RULES.md`。

- 顶层与 `config.schemaVersion` 当前均为 `2`；旧模板会在导入时执行一次性迁移。
- `matchFormat` 推导地图槽位：FT2=5、FT3=7、FT4=9，管理员不能直接设置 `stageCount`。
- 地图池在所有地图策略下都必须至少包含相应数量的不同地图。
- `fixed_map_order` 允许重复，也允许少于理论槽位；不足时仅警告。未知地图、地图池外地图或缺少有效地图能力的地图禁止保存。
- 比分流程固定为任一队提交、另一队确认或拒绝，管理员可直接录入；不再提供 `scoreReportMode`。
- 阵容位、每方 Ban 数和英雄池来自固定规则与锁定目录，不作为管理员配置。
- 比赛开始后锁定房间配置；全局模板后续修改不会影响现有房间。

全局管理员可以导入完整模板对象；房间管理员也可以只导入其中的 `config` 对象。
