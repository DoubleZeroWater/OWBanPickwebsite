# 房间权威 Status 状态模型

## 1. 文档目的

本文档定义一个 BP 房间的 `status` 数据结构。

`status` 是由后端维护的、可被保存到历史列表中的**主要状态快照**。任意一份完整的 `status` 都应当足以让队伍 1、队伍 2、管理员和直播端恢复到同一个确定页面，而不需要重放此前的操作记录。

它保存的是已经成为比赛事实的结果，例如：

- 房间和比赛配置；
- 当前比赛进行到哪个主要阶段；
- 已经最终确认的地图、选边、阵容、Ban 和比分；
- 谁拥有当前阶段的正式操作权；
- 系列赛当前结果。

它不保存尚未成为比赛事实的临时内容，例如：

- 某一方尚未完成的表单输入；
- 只有一方完成的阵容提交；
- 等待另一方确认的比分提案；
- 当前倒计时的剩余时间；
- 在线人数、网络延迟和心跳时间；
- 弹窗、输入框焦点及其他浏览器界面状态；
- 实际点击按钮的人是队伍、管理员还是超时处理程序。

上述临时同步内容属于 `runtime`，纯界面内容属于各浏览器自己的 `localUI`。操作成功后生成的共享通知属于独立的 `notificationStream`，不进入 `status` 或状态哈希。

---

## 2. 推荐的整体结构

下面的 JSON 只表达字段组织方式。具体配置项、地图模式和阶段类型可以根据现有业务规则继续扩展。

带有全部字段、枚举、中文注释以及当前实现迁移说明的规范示例见 [`status.yaml`](./status.yaml)。

```json
{
  "schemaVersion": 2,
  "roomId": "abcd",
  "epoch": 1,
  "revision": 38,
  "hash": "sha256:...",
  "catalogHash": "sha256:catalog...",
  "lifecycle": "running",
  "config": {},
  "match": {
    "teams": {
      "left": {
        "id": "team-left",
        "name": "Team 1",
        "seed": 1,
        "seriesScore": 1
      },
      "right": {
        "id": "team-right",
        "name": "Team 2",
        "seed": 2,
        "seriesScore": 0
      }
    },
    "decisions": {
      "firstMapPickerSide": "left",
      "firstMapSidePickerSide": "left",
      "openingBanSide": "left"
    },
    "winnerSide": null,
    "maps": [
      {
        "index": 0,
        "status": "completed",
        "mapId": "lijiang_tower",
        "modeId": "control",
        "pickerSide": "left",
        "sideChoice": {
          "kind": "color",
          "chooserSide": "left",
          "selectedSide": "right",
          "blueSide": "right",
          "redSide": "left",
          "attackSide": null,
          "defenseSide": null
        },
        "lineups": {
          "left": {
            "damage-1": "left-player-1",
            "damage-2": "left-player-2",
            "tank-1": "left-player-3",
            "support-1": "left-player-4",
            "support-2": "left-player-5"
          },
          "right": {
            "damage-1": "right-player-1",
            "damage-2": "right-player-2",
            "tank-1": "right-player-3",
            "support-1": "right-player-4",
            "support-2": "right-player-5"
          }
        },
        "bans": {
          "firstBanSide": "left",
          "leftHeroId": "tracer",
          "rightHeroId": "ana"
        },
        "score": {
          "left": 2,
          "right": 0
        },
        "winnerSide": "left",
        "forfeitSide": null,
        "forfeitReason": null
      },
      {
        "index": 1,
        "status": "pending",
        "mapId": null,
        "modeId": null,
        "pickerSide": "right",
        "sideChoice": null,
        "lineups": null,
        "bans": {
          "firstBanSide": null,
          "leftHeroId": null,
          "rightHeroId": null
        },
        "score": null,
        "winnerSide": null,
        "forfeitSide": null,
        "forfeitReason": null
      }
    ]
  },
  "phase": {
    "phaseId": "1:38:map_pick",
    "type": "map_pick",
    "mapIndex": 1,
    "actorSide": "right",
    "data": {}
  }
}
```

---

## 3. 顶层字段

### `schemaVersion`

表示这份状态所使用的数据格式版本，用于前后端判断自己能否正确读取该状态。

- 类型：正整数；
- 示例：`2`；
- 只有数据结构发生不兼容变化时才递增；
- 它不是比赛版本，也不会在每次选择后变化。

例如将 `bans.leftHeroId` 和 `bans.rightHeroId` 改成新的数组结构时，可能需要提升 `schemaVersion`。

### `roomId`

表示状态属于哪个房间。

- 类型：字符串；
- 示例：`"abcd"`；
- 主要用于路由、日志、校验和调试；
- 不能把它当作队伍或管理员的鉴权凭证。

如果房间码同时承担了访问入口的作用，后端仍应使用单独的角色令牌判断请求来自左队、右队、管理员还是直播端。

### `epoch`

表示当前房间处于哪一条状态时间线。

- 类型：非负整数；
- 初始值通常为 `0` 或 `1`；
- 管理员执行破坏当前时间线的回退、重开或重新初始化时递增；
- 普通的 BP 推进不改变 `epoch`。

客户端发现 `epoch` 变化时，应丢弃旧阶段的 `runtime`、未完成请求和不再适用的本地界面状态。

回退不是让 `revision` 变小。后端应复制目标历史状态的比赛内容，然后生成一个拥有**新 epoch 和新 revision** 的当前状态。

### `revision`

表示后端发布了多少个主要状态版本，也是状态快照的单调递增序号。

- 类型：非负整数；
- 每产生一个新的主要状态时加一；
- 同一个房间内不应重复；
- 即使发生回退，也继续递增，而不是回到旧编号。

它可以快速判断客户端是否明显落后，但不能单独证明内容完全一致，因此还要配合 `hash`。

### `hash`

表示当前 `status` 内容的稳定摘要，用于发现“revision 相同但内容不同”的同步错误。

- 类型：字符串；
- 推荐算法：SHA-256；
- 推荐计算对象：排除 `hash` 字段本身后的规范化 JSON；
- 所有对象键必须采用固定顺序，数字、空值和数组也必须使用统一序列化规则。

`hash` 只用于一致性检查，不用于鉴权，也不能替代角色令牌。

心跳同步时：

1. 客户端提交自己的 `epoch`、`revision` 和 `hash`；
2. 三者与服务器当前状态一致时，服务器只需返回最新 `runtime`；
3. 任意一项不一致时，服务器返回完整的最新 `status + runtime`。

### `lifecycle`

表示整个房间或比赛的大生命周期，不负责描述每一个具体 BP 步骤。

推荐可选值：

| 值 | 含义 |
| --- | --- |
| `preparing` | 房间正在配置，比赛尚未正式开始 |
| `running` | 比赛正在进行 |
| `completed` | 系列赛已经正常结束 |

具体处于选图、选边还是 Ban 英雄阶段，应读取 `phase.type`。

### `config`

保存已经对本场比赛生效的完整规则配置，使任意状态快照都可以独立解释。

完整配置直接位于 [`status.yaml`](./status.yaml) 的 `config` 主键下，不再维护独立配置 YAML。

典型内容包括：

- 赛制，例如 FT2、FT3；
- 地图池与模式顺序；
- 是否允许重复地图；
- 阵容人数与英雄限制；
- Ban 规则和先后顺序；
- 每个阶段的默认时间；
- 休息阶段规则；
- 超时后的默认处理方式。

一旦比赛开始，建议锁定会改变比赛含义的配置。若管理员必须修改规则，应产生新的主要状态，而不是静默修改已有历史状态。

---

## 4. `match`：已经确定的比赛事实

`match` 保存从比赛开始到当前时刻已经最终确定的内容。页面不需要回放操作日志，只需读取它就能还原地图列表、系列赛比分和各地图详情。

### `match.teams`

保存左右两支参赛队伍及其系列赛信息。

推荐结构：

```json
{
  "left": {
    "id": "team-left",
    "name": "Team 1",
    "seed": null,
    "seriesScore": 1
  },
  "right": {
    "id": "team-right",
    "name": "Team 2",
    "seed": null,
    "seriesScore": 0
  }
}
```

字段说明：

- `id`：队伍的稳定标识；
- `name`：页面展示名称；
- `seed`：可选的种子信息，没有时为 `null`；
- `seriesScore`：当前赢得的地图数。

`seriesScore` 可以由 `match.maps[].winnerSide` 重新计算。保留它可以简化前端渲染，但后端必须保证二者一致，不能接受客户端独立修改该数值。

### `match.decisions`

保存影响整场系列赛、而不是只影响某一张地图的最终决定。

例如：

```json
{
  "firstMapPickerSide": "left",
  "firstMapSidePickerSide": "left",
  "openingBanSide": "left"
}
```

可能包含：

- `firstMapPickerSide`：第一张地图由哪一方先选；
- `firstMapSidePickerSide`：第一张地图由哪一方拥有选边权；没有实际选择者时为 `null`；
- `openingBanSide`：如果规则要求在系列赛开始时确定全局 Ban 先手，则记录在此；
- 其他通过抛硬币、随机数或赛前规则确定的全局结果。

这里只保存最终结果，不保存谁点击了随机按钮，也不保存随机动画过程。

### `match.maps`

按比赛顺序保存每一张地图的最终事实。

- 类型：数组；
- 数组位置应与地图顺序一致；
- 尚未开始的地图可以不创建，也可以创建为 `pending`，但整个项目必须统一一种规则；
- 已确认的旧地图内容不应被普通操作修改。

---

## 5. 每张地图的字段

### `index`

地图在本场系列赛中的序号。

- 类型：非负整数；
- 建议从 `0` 开始；
- 前端显示时可以使用 `index + 1`；
- `phase.mapIndex` 应引用这里的值。

### `status`

表示这张地图自身的生命周期。

推荐可选值：

| 值 | 含义 |
| --- | --- |
| `pending` | 地图槽位已存在，但选图或赛前流程尚未完成 |
| `selected` | 地图已经确定，正在进行选边、阵容、Ban 或比分流程 |
| `completed` | 地图已正常结束并确认比分 |
| `forfeited` | 地图因一方弃权而结束 |

### `mapId`

被选择地图的稳定标识。

- 类型：字符串或 `null`；
- 选图完成前为 `null`；
- 选图完成后写入，例如 `"lijiang_tower"`；
- 应引用后端认可的地图目录，而不是直接保存可随语言变化的显示名称。

### `modeId`

该地图的游戏模式。

可能的值应以项目内的地图目录为准，例如：

- `control`；
- `escort`；
- `hybrid`；
- `push`；
- `flashpoint`；
- 以后新增的正式比赛模式。

它通常可以由 `mapId` 推导。将其保存在快照内可以让历史状态不依赖未来可能变化的地图目录，但后端必须验证 `mapId` 与 `modeId` 相符。

### `pickerSide`

表示哪一方正式选择了这张地图。

- 可选值：`left`、`right` 或 `null`；
- 尚未选图时为 `null`；
- 管理员代操作也仍然记录规则意义上的队伍一方，而不是记录 `admin`。

### `sideChoice`

保存该地图已经最终确认的选边结果。尚未选边时为 `null`。

不同模式可能需要不同结构。例如颜色选边：

```json
{
  "kind": "color",
  "chooserSide": "right",
  "blueSide": "right",
  "redSide": "left"
}
```

进攻/防守选边：

```json
{
  "kind": "attack_defense",
  "chooserSide": "right",
  "attackSide": "left",
  "defenseSide": "right"
}
```

字段含义：

- `kind`：本次选边使用的规则类型；
- `chooserSide`：拥有选边权的一方；
- 其余字段：最终确定的双方位置。

其中一方的位置通常可以通过另一方推导。全部保存可以简化四端渲染，但后端必须检查双方不能占据同一位置。

### `lineups`

保存双方都完成提交后，已经正式确认的阵容。

```json
{
  "left": {
    "damage-1": "left-player-1",
    "damage-2": "left-player-2",
    "tank-1": "left-player-3",
    "support-1": "left-player-4",
    "support-2": "left-player-5"
  },
  "right": {
    "damage-1": "right-player-1",
    "damage-2": "right-player-2",
    "tank-1": "right-player-3",
    "support-1": "right-player-4",
    "support-2": "right-player-5"
  }
}
```

- `lineups` 保存的是上场选手，不是英雄选择；
- 每个键必须来自 `config.lineupSlots[].id`；
- 尚未进入阵容阶段或尚未完成双方确认时为 `null`；
- 只有一方提交时，提交结果暂存在 `runtime`，不产生新的 `status`；
- 双方都完成后，后端一次性写入最终 `lineups` 并产生新 revision；
- 各浏览器尚未提交的输入框内容只保留在本地。

这样一来，回退到阵容阶段时总是回到“双方都尚未提交”的主要状态，而不会回到某一方已经提交的中间状态。

### `bans.firstBanSide`

记录这张地图最终确定的 Ban 先手。

- 可选值：`left`、`right` 或 `null`；
- 尚未确定 Ban 顺序时为 `null`；
- 它表达比赛结果中的先后关系，不表达实际操作按钮的人。

### `bans.leftHeroId`

记录左队最终 Ban 掉的英雄。

- 类型：英雄 ID 字符串或 `null`；
- 左队尚未完成 Ban 时为 `null`；
- 即使由管理员代选或超时自动选择，仍写入左队对应字段。

### `bans.rightHeroId`

记录右队最终 Ban 掉的英雄，语义与 `leftHeroId` 相同。

如果未来一方可能拥有多个 Ban 位，建议将结构升级为：

```json
{
  "firstBanSide": "left",
  "bySide": {
    "left": ["hero-f"],
    "right": ["hero-a"]
  }
}
```

### `score`

保存双方最终确认的本地图比分。

```json
{
  "left": 2,
  "right": 1
}
```

- 未确认时为 `null`；
- 某一方提交、正在等待另一方确认的比分提案属于 `runtime`；
- 双方确认或管理员裁定后，才写入 `status`；
- 后端应根据地图模式验证比分是否合法。

### `winnerSide`

保存该地图的最终胜方。

- 可选值：`left`、`right` 或 `null`；
- 地图未完成时为 `null`；
- 通常可以由 `score` 推导；
- 弃权等特殊结束方式下，不一定能仅通过普通比分推导。

保留该字段能简化系列赛比分统计。后端应成为唯一计算者，客户端不能分别提交 `score` 和 `winnerSide`。

### `forfeitSide`

记录是否有一方在本地图弃权。

- 可选值：`left`、`right` 或 `null`；
- 正常完成时为 `null`；
- 地图弃权时填写弃权方；
- 可按业务需要增加 `forfeitReason`，但不要保存仅用于提示的临时文案。

---

## 6. `phase`：当前主要阶段

`phase` 描述服务器当前允许发生哪类正式操作。它属于 `status`，因为刷新页面或同步到其他端后，所有客户端必须进入同一个主页面。

倒计时不放在 `phase` 中。阶段的总时长、剩余时长、单方临时提交和确认状态属于 `runtime`。

### `phase.phaseId`

当前阶段实例的唯一标识，用来阻止延迟请求污染新阶段。

- 类型：字符串；
- 每次创建新阶段时都必须变化；
- 即使回退后再次进入同名阶段，也不能复用旧 ID；
- 可以使用 UUID，也可以使用 `epoch:revision:type` 形式。

客户端提交操作时应携带 `phaseId`。服务器只接受与当前 `phaseId` 相符的请求，否则返回状态已过期，让客户端重新同步。

### `phase.type`

表示当前具体处于哪个 BP 阶段，决定四端应该显示什么以及允许什么操作。

推荐初始集合：

| 值 | 含义 |
| --- | --- |
| `configuring` | 管理员配置房间 |
| `waiting_ready` | 等待双方准备 |
| `pre_start_rest` | 比赛开始前的休息或准备阶段 |
| `interactive_random` | 通过双方输入或随机流程确定某项全局结果 |
| `map_pick` | 有权队伍选择地图 |
| `side_pick` | 有权队伍选择颜色或攻防 |
| `lineup_pick` | 双方提交阵容 |
| `ban_order` | 确定 Ban 先手 |
| `ban_first` | 第一手 Ban |
| `ban_second` | 第二手 Ban |
| `score_entry` | 提交并确认地图比分 |
| `post_map_rest` | 地图结束后的休息阶段 |
| `completed` | 系列赛结束 |

这些值应被定义为后端和前端共享的固定枚举，避免各页面使用不同字符串解释同一阶段。

### `phase.mapIndex`

表示当前阶段作用于哪一张地图。

- 类型：非负整数或 `null`；
- 地图相关阶段必须填写；
- 配置、全局随机、系列赛结束等不针对具体地图的阶段可以为 `null`；
- 其值必须能在 `match.maps` 中找到对应地图，或符合项目约定的“正在创建下一张地图”规则。

### `phase.actorSide`

表示按照比赛规则，当前哪一方拥有正式操作权。

推荐可选值：

| 值 | 含义 |
| --- | --- |
| `left` | 左队拥有操作权 |
| `right` | 右队拥有操作权 |
| `both` | 双方都需要独立操作，例如提交阵容 |
| `null` | 没有队伍操作，例如休息或比赛结束 |

管理员是否允许代操作是权限规则，不应通过把 `actorSide` 改成 `admin` 表达。直播端通常只有读取权。

### `phase.data`

保存解释当前阶段所必需的、已经确定的少量上下文。它不能被当作随意堆放临时字段的容器。

示例：

```json
{
  "type": "interactive_random",
  "data": {
    "purpose": "first_map_picker"
  }
}
```

```json
{
  "type": "side_pick",
  "data": {
    "choiceKind": "attack_defense"
  }
}
```

推荐为每个 `phase.type` 单独定义允许出现的 `data` 结构：

- `interactive_random`：可包含 `purpose`；
- `side_pick`：可包含 `choiceKind`；
- `completed`：可以包含展示所需的最终胜方，也可以从 `match` 推导；
- 不需要额外上下文的阶段使用空对象 `{}`。

倒计时、某方是否已提交以及待确认的提案均不应放入 `phase.data`。

---

## 7. 与 `runtime` 的边界

推荐的服务器同步响应结构如下：

```json
{
  "status": {},
  "runtime": {
    "baseStatusRevision": 38,
    "baseStatusHash": "sha256:...",
    "phaseId": "1:38:map_pick",
    "totalTimeMs": 30000,
    "remainingTimeMs": 18420,
    "pending": {},
    "presence": {}
  }
}
```

`runtime` 不需要自己的历史 revision，但必须携带以下绑定信息：

- `baseStatusRevision`：它属于哪个 status revision；
- `baseStatusHash`：它对应哪份 status 内容；
- `phaseId`：它属于哪一个具体阶段实例。

客户端只能在这三个值与当前 `status` 相符时应用该 runtime。这样可以丢弃网络延迟导致的旧心跳响应，而不必为 runtime 建立可回退的历史列表。

`runtime` 中可以包含：

- `totalTimeMs` 和 `remainingTimeMs`；
- 双方是否已经完成本阶段提交；
- 等待确认的比分提案以及由哪一方提交；
- 尚未汇合为最终结果的服务端随机值；
- 当前在线连接和最近心跳情况。

进入新的主要状态或发生回退时，服务器根据新 `status + config` 创建一份默认 runtime，不沿用旧阶段的临时内容。

---

## 8. 主要状态何时产生

只有当页面进入一个值得回退的主要节点，或者新的比赛事实已经最终确定时，才创建一个新 `status`。

以一张地图为例：

1. 进入选图阶段：产生新 status；
2. 地图最终选定并进入选边：产生新 status；
3. 选边最终确定并进入阵容阶段：产生新 status；
4. 只有一方提交阵容：只修改 runtime；
5. 双方阵容均完成：把完整阵容写入 status，进入 Ban 顺序阶段；
6. Ban 先手最终确定：产生新 status；
7. 第一手 Ban 完成：写入结果并产生新 status；
8. 第二手 Ban 完成：写入结果并产生新 status；
9. 一方提交比分提案：只修改 runtime；
10. 比分最终确认：写入 status，进入地图后休息或完成比赛。

因此历史列表保存的是一组可以直接恢复页面的完整快照，而不是每次点击产生的操作日志。

---

## 9. 回退规则

假设当前状态为 revision 38，管理员选择历史 revision 20 作为回退目标：

1. 读取 revision 20 中需要恢复的 `config`、`match` 和 `phase` 内容；
2. 不直接把当前 revision 改回 20；
3. 创建一个新的当前状态，例如 `epoch = 2`、`revision = 39`；
4. 为恢复后的阶段创建新的 `phaseId`；
5. 重新计算新状态的 `hash`；
6. 清空旧 runtime，并根据恢复后的阶段和默认配置创建新 runtime；
7. 四个客户端在下一次同步时收到新的完整 `status + runtime`。

这能保证已经在网络中的旧请求无法被误认为当前阶段请求，也保证 revision 始终单调递增。

房间管理员界面不展示 revision、epoch 或抽象阶段名。它固定展示每张地图的“选图、确认上人、确认 Ban、录入比赛得分”，前端在当前历史分支中选择对应业务阶段最新的 revision；“确认 Ban”优先映射 `ban_order`，不存在时映射 `ban_first`。选择后点击一次“确认回退”即提交现有 `{ revision }` 请求。

---

## 10. 权威通知游标

所有 action、rollback 和 heartbeat 响应同时返回：

```json
{
  "notificationStream": {
    "cursor": 42,
    "events": []
  }
}
```

请求携带 `notificationCursor`。首次进入传 `null`，服务器只返回当前游标而不重放旧提示；之后仅返回游标之后的事件。服务器为每个房间最多保存 100 条事件，前端按 `eventId` 去重。通知事件包含 `eventId`、`sequence`、`eventType`、`actor`、`payload`、`occurredAt` 和 `statusVersion`，不参与 `status` 哈希。

共享事件只在操作或自动转换成功后由服务器创建；拒绝响应和网络失败只由发起入口显示本地中性通知。

---

## 11. 后端必须维护的不变量

为防止四个页面再次出现不同状态，后端应集中维护下列约束：

- `revision` 只能递增；
- 新的阶段实例必须拥有新的 `phaseId`；
- `hash` 必须由后端根据规范化状态计算；
- `phase.mapIndex` 必须指向合法地图；
- `mapId` 与 `modeId` 必须匹配；
- `sideChoice` 中双方不能占据相同位置；
- `winnerSide`、地图 `score` 和 `forfeitSide` 必须互相一致；
- `match.teams.*.seriesScore` 必须与已完成地图结果一致；
- 已最终确认的事实只能通过合法的下一阶段转换或管理员回退改变；
- 客户端只能发送“意图”，不能上传并覆盖完整权威状态；
- 每个修改请求都必须校验角色权限、当前 `phaseId` 和必要的幂等请求 ID。

最重要的原则是：**前端负责展示和提交操作意图，后端负责判断操作是否合法并生成下一份完整状态。**

---

## 11. 建议的历史保存形式

每个房间可以在内存中维护：

```text
currentStatus
statusHistory[]
currentRuntime
```

- `currentStatus`：当前解析后的完整状态，方便业务逻辑读取；
- `statusHistory[]`：每次主要变更后的完整 status 快照；
- `currentRuntime`：当前阶段的瞬时同步数据，不加入历史列表。

为减少 Python 对大量深拷贝对象的内存开销，历史快照可以保存为规范化后的紧凑 JSON 字节串；需要回退时再反序列化目标项。

按目前讨论的 FT2 流程估算：

- 单个完整 status 通常约 `5–12 KB`；
- 为字段增长预留空间后，可以按 `15–25 KB` 做保守预算；
- 一场打满三张地图的 FT2 通常产生约 20–30 个主要状态；
- 一场比赛的完整 status 历史大致约 `0.2–0.5 MB`，复杂情况下仍通常低于 `1 MB`。

即使同时存在 20 个房间，这部分状态历史对 2 GB 内存也不是主要压力。真正需要重点控制的是请求频率、磁盘同步写入、单进程阻塞操作以及无界增长的房间生命周期。
