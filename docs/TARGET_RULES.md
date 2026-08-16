# OW Ban Pick 目标规则

本文档是当前产品与后端重构的唯一目标规则清单。它基于状态流程图、现有产品行为以及截至 2026-08-02 的讨论整理。

本文档目前仍是 Draft 0.2。规则状态含义如下：

- `已确认`：产品负责人已经明确确认。
- `继承现状`：来自当前流程或产品，尚未被否定，但仍应再次确认。
- `待定义`：已经确定需要该能力，但行为还不够精确。
- `建议`：架构或协议建议，尚未得到产品负责人确认。
- 已修改：针对原有的问题进行了修改。

旧实现只能作为现状证据，不能自动成为目标规范。审计和实现时应引用稳定规则 ID。

## 1. 房间生命周期

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `ROOM-001` | 继承现状 | 房间经历配置、准备、正式比赛、结束四个宏观阶段。 |
| `ROOM-002` | 继承现状 | 配置阶段用于确定本房间比赛配置。 |
| `ROOM-003` | 继承现状 | 准备阶段等待双方队伍完成准备。 |
| `ROOM-004` | 继承现状 | 双方满足开始条件后进入正式比赛阶段。 |
| `ROOM-005` | 已确认 | 正式比赛由逐地图流程组成，直到产生系列赛获胜方。 |
| `ROOM-006` | 已确认 | 系列赛产生最终获胜方后进入结束阶段。 |
| `ROOM-007` | 已确认 | 活动房间只存在于内存中。 |
| `ROOM-008` | 已确认 | 服务重启后，所有活动房间直接消失，不恢复活动状态。 |
| `ROOM-009` | 已修改 | 失效房间的旧入口再次访问时返回什么错误。->和访问一个不存在的房间代码一样产生的错误。（页面：无法打开赛事方页面，房间入口不存在；输入代码进入房间页面：房间入口不存在）  |
| `ROOM-010` | 已确认 | 房间关闭、过期、归档和历史管理需要纳入最终规范。 |
| `ROOM-011` | 已修改 | 房间自动过期、主动关闭和正常比赛结束之间的区别。-> 房间只会存在自动过期和比赛结束，自动过期的房间是因为时间inactiveTimeoutMinutes之后没有任何操作，导致房间关闭。比赛结束，计算endTimeoutMinutes，导致房间关闭。 |
| `ROOM-012` | 已修改 | 房间结束后允许查看多久，以及哪些入口仍然有效。-> 比赛结束，计算endTimeoutMinutes，导致房间关闭。 |

## 2. 角色与权限

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `AUTH-001` | 继承现状 | 房间至少具有队伍1、队伍2、房间管理员和直播四种入口。 |
| `AUTH-002` | 继承现状 | 队伍入口只能替自己队伍执行操作。 |
| `AUTH-003` | 已确认 | 管理员可以在对应阶段代替某一队伍提交操作。 |
| `AUTH-004` | 已确认 | 管理员不能覆盖已经确认提交的队伍操作。 |
| `AUTH-005` | 继承现状 | 直播入口只读。 |
| `AUTH-006` | 已修改 | 管理员代操作产生的事件是否需要记录“由管理员代操作”。-> 需要记录，需要在通知中显示 |
| `AUTH-007` | 已修改 | 全局管理员是否能够直接进入并代操作任意房间。-> 可以，但是不能直接进入，全局管理员因为能看到对应的房间代号 |
| `AUTH-008` | 已修改 继承现状 | 入口 token 的生成、碰撞、失效和泄露处理规则。-> 生成的token是4位0-9a-z，碰撞的时候就更换下一个随机数，一共生成四个token，入口token失效=房间过期=（页面：无法打开赛事方页面，房间入口不存在；输入代码进入房间页面：房间入口不存在），不会认为会产生泄露规则 |
| `AUTH-009` | 已修改 | 房间管理员是否能查看尚未公开的秘密提交。-> 不能 |

## 3. 比赛配置与全局设置

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `CFG-001` | 继承现状 | 比赛开始前存在可编辑的房间比赛配置。 |
| `CFG-002` | 继承现状 | 比赛配置包含赛制、地图、选边、阵容、BP、比分和超时规则。 |
| `CFG-003` | 建议 已确认 | 全局比赛设置只作为新房间的默认配置。 |
| `CFG-004` | 建议 已确认 | 创建房间时，将全局默认配置复制成独立房间配置。 |
| `CFG-005` | 建议 已确认 | 正式比赛开始时锁定房间配置。 |
| `CFG-006` | 建议 已确认 | 修改全局默认配置不得影响现有房间。 |
| `CFG-007` | 建议 已确认 | 状态机只读取房间自身的锁定配置。 |
| `CFG-008` | 建议 已确认 | 锁定配置具有 `configVersion` 和 `configHash`。 |
| `CFG-009` | 已确认 | 准备阶段是否仍允许管理员修改配置。-> 不允许 |
| `CFG-010` | 已确认 | 修改配置后，双方已准备状态是否重置。-> 进入了准备界面之后就禁止修改配置了 |
| `CFG-011` | 已确认 | 普通阶段回退是否保持配置锁定。-> 保持锁定 |
| `CFG-012` | 已确认 | “回到赛前配置”是否创建新的配置版本并清空比赛事实。-> 是的 |
| `CFG-013` | 定义 已修改 | 所有配置字段的类型、范围、默认值和非法组合。-> 在List #21|
| `CFG-014` | 已确认 已修改  | 全局预设、默认设置和站点运行设置在服务重启后是否持久保留。-> 持久化为json  |
| `CFG-015` | 已确认 | 地图池必须至少包含 `stageCount` 张不同地图；不足时禁止保存。 |
| `CFG-016` | 已确认 | `fixed_map_order` 允许少于 `stageCount` 项并允许重复地图；保存时显示警告，但不禁止保存。 |
| `CFG-017` | 已确认 | BP 关闭时，忽略并隐藏全部 Ban 子设置。 |
| `CFG-018` | 已确认 | 当前地图不会进入主动选边时，忽略并隐藏选边超时设置。 |
| `CFG-019` | 已确认 | 只有需要双方分别提交阵容的模式才显示阵容提交超时设置。 |
| `CFG-020` | 已确认 | 固定地图顺序中的每一个地图 ID 必须存在于当前目录、属于本场地图池，并具有有效地图能力定义；任一条件不满足时禁止保存。 |

## 4. 地图选择策略

正式协议中不应继续使用“模式1～5”，建议采用稳定名称。

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `MAP-001` | 已确认 | 可选地图来自当前比赛配置的地图池。 |
| `MAP-002` | 已确认 | “固定地图池”和“地图池”是相同概念。 |
| `MAP-003` | 已确认 | 非固定地图顺序策略中，已经使用过的地图不能在同一系列赛中再次使用；`fixed_map_order` 按配置执行，允许重复地图。 |
| `MAP-004` | 已确认 | 地图模式循环完成后，开启新一轮模式循环。 |
| `MAP-005` | 已确认 | 非固定顺序策略的新模式循环允许模式再次出现，但仍然禁止地图本身重复。 |
| `MAP-006` | 继承现状 | `first_mode_then_unique_mode`：首图必须使用指定模式，之后按模式不重复规则选择。 |
| `MAP-007` | 继承现状 | `unique_mode_until_cycle`：首图可以使用任意模式，本轮所有模式使用前不能重复模式。 |
| `MAP-008` | 继承现状 | `strict_mode_order`：每个地图序号使用配置中对应的指定模式。 |
| `MAP-009` | 继承现状 | `unique_map`：可以选择地图池中的任意合法且未使用地图。 |
| `MAP-010` | 已确认 | `fixed_map_order`：地图由固定地图顺序直接决定。 |
| `MAP-011` | 已确认 | 固定地图顺序模式不存在真实的选图动作。 |
| `MAP-012` | 已确认 | 固定地图顺序模式仍在存在选边或 Ban 优势方等消费者时计算优先选择方。 |
| `MAP-013` | 已确认 | 固定地图顺序模式首图不制造虚假选图方或选图操作。 |
| `MAP-014` | 已确认 | 固定地图顺序模式后续地图仍按优先选择方规则推导选边方或 Ban 优势方。 |
| `MAP-015` | 已确认 | 固定地图顺序模式不得为了复用其他逻辑而制造一个虚假的选图方。 |
| `MAP-016` | 已确认 | 没有合法地图可选时进入管理员裁定整个系列赛获胜方。 |
| `MAP-017` | 已确认 | 没有合法地图时直接进入管理员裁定整个系列赛获胜方；该裁定等待不存在自动超时。 |
| `MAP-018` | 已确认 | 固定地图顺序允许配置并实际使用重复地图。 |
| `MAP-019` | 已确认 | 固定地图顺序允许少于理论最大地图槽位数；保存时警告，运行到顺序耗尽且系列赛仍未结束时，进入管理员裁定整个系列赛获胜方。 |
| `MAP-020` | 已确认 | 地图池在比赛开始后是否完全冻结。-> 是的，禁止修改配置，配置包含地图池 |
| `MAP-021` | 已确认 | 地图目录更新后，已经开始的房间如何解释旧地图 ID。-> 不会存在有人在使用的时候更新 |
| `MAP-022` | 已确认 | 固定地图顺序允许重复和长度不足，但不允许引用未知地图、地图池外地图或缺少有效 `sideSelectionKind` 的地图。 |

## 5. 优先选择方计算

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `PRIORITY-001` | 已确认 | 统一使用“优先选择方”，不再把共享决策所有者命名为“选图方”。 |
| `PRIORITY-002` | 已确认 | 初始优先选择方策略支持 `interactive_random`、`system_random`、`left`、`right`，默认 `interactive_random`。 |
| `PRIORITY-003` | 已确认 | 后续优先选择方策略支持最近一张非平局地图的败者或胜者，默认败者。 |
| `PRIORITY-004` | 已确认 | 上一张地图平局时，向前寻找最近一张非平局地图，并按后续策略取得该图胜者或败者。 |
| `PRIORITY-005` | 已确认 | 如果此前所有地图均为平局，继续使用本系列赛不可变的初始优先选择方，绝不进入管理员裁定优先方。 |
| `PRIORITY-006` | 已确认 | 当首图没有地图选择、主动选边或 Ban 优势方等消费者时，初始优先选择方可以暂不生成。 |
| `PRIORITY-007` | 已确认 | 后续首次出现消费者且此前仍全部平局时，按初始策略惰性生成一次初始优先选择方；生成后在本系列赛内不可改变。 |
| `PRIORITY-008` | 已确认 | 模式1～4由优先选择方选择地图；模式5只在有实际消费者时使用优先选择方，不制造虚假选图操作。 |
| `PRIORITY-009` | 已确认 | 如果整个系列赛始终不存在优先选择方消费者，初始优先选择方允许永久保持 `null`。 |

## 6. 互动随机与系统随机

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `RANDOM-001` | 继承现状 | 系统随机结果由服务端生成。 |
| `RANDOM-002` | 已确认 | 互动随机过程属于秘密信息。 |
| `RANDOM-003` | 已确认 | 互动随机结果产生前，双方不能看到对方提交。 |
| `RANDOM-004` | 已确认 | 互动随机的具体算法，例如双方提交 0/1 后执行 XOR。 |
| `RANDOM-005` | 已确认 | 一方未提交时的超时行为。-> 未提交默认选0 |
| `RANDOM-006` | 已确认 | 管理员是否能够看到双方尚未公开的互动随机输入。-> 不能 |
| `RANDOM-007` | 已确认 | 系统随机是否需要记录随机种子或审计证据。-> 不需要 |
| `RANDOM-008` | 已确认 | 相同 `commandId` 的网络重试必须返回第一次执行产生的随机结果；使用新 `commandId` 的新随机命令可以产生不同结果。 |
| `RANDOM-009` | 已确认 | 任何随机策略进入执行时都必须已经具有至少一个合法候选；候选集合由服务端按当前事实计算，不设计“开始随机后没有合法候选”的业务分支。 |

## 7. 地图能力与选边

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `SIDE-001` | 已确认 | 地图目录应声明地图使用哪种选边能力，而不是在状态机里硬编码模式名称。 |
| `SIDE-002` | 已确认 | 地图的选边能力至少包括 `attack_defense`、`red_blue` 和 `none`。 |
| `SIDE-003` | 继承现状 | Escort/Hybrid 类型地图必须选择进攻方和防守方。 |
| `SIDE-004` | 已确认 | 对称地图只有在 `symmetricSideChoiceEnabled` 开启时才进入红蓝方选择；默认关闭。 |
| `SIDE-005` | 已确认 | `firstMapSideChoiceEnabled` 是所有地图选择策略通用的首图主动选边开关，默认关闭。 |
| `SIDE-006` | 已确认 | 首图主动选边关闭时，队伍1固定为蓝方/先防守，队伍2固定为红方/先进攻。 |
| `SIDE-007` | 已确认 | 需要主动选边时，选边者可配置为优先选择方或非优先选择方。 |
| `SIDE-008` | 已确认 | 选边超时支持：随机合法选项、选择蓝色/防守方、选择红色/进攻方、管理员裁定、延迟后重新选择、本张地图判负。 |
| `SIDE-009` | 已确认 | 选边超时默认选择蓝色/防守方；固定结果按地图能力映射为蓝色/红色或防守/进攻。 |
| `SIDE-010` | 已确认 | 关闭对应主动选边能力时，跳过选边 Phase，并忽略、隐藏其超时策略。 |
| `SIDE-012` | 已确认 | 已经确认的选边结果是否允许管理员修改。-> 不允许 |
| `SIDE-013` | 已确认 | 无须选边的地图是否完全跳过 Phase，还是产生自动决定事件。-> 跳过 |

## 8. 阵容提交

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `LINEUP-001` | 已确认 | 一方阵容必须恰好包含5名选手。 |
| `LINEUP-002` | 已确认 | 阵容位置固定为输出、输出、重装、支援、支援。 |
| `LINEUP-003` | 已确认 | 同一方阵容中的选手不能重复。 |
| `LINEUP-004` | 已确认 | 阵容支持双方自由输入模式。 |
| `LINEUP-005` | 已确认 | 阵容支持从管理员预设名单中选择。 |
| `LINEUP-006` | 已确认 | 阵容支持跳过输入模式。 |
| `LINEUP-007` | 已确认 | 双方可以并行提交自己的阵容。 |
| `LINEUP-008` | 已确认 | 一方提交后，其阵容立即锁定，不能修改。 |
| `LINEUP-009` | 已确认 | 双方均提交完成前，不能向对方公开阵容内容。 |
| `LINEUP-010` | 已确认 | 双方均提交完成后，阵容内容立刻公开。 |
| `LINEUP-011` | 已确认 | 管理员可以在阵容阶段代替尚未提交的一方填写阵容。 |
| `LINEUP-012` | 已确认 | 管理员不能覆盖已经提交的一方阵容。 |
| `LINEUP-013` | 继承现状 | 阵容阶段位于选边之后、BP之前。 |
| `LINEUP-014` | 已确认 | 一方提交后刷新页面，能否重新看见自己已锁定的阵容。-> 可以看到 |
| `LINEUP-015` | 已确认 | 双方提交前，房间管理员能否看到阵容内容。-> 不能 |
| `LINEUP-016` | 已确认 | 双方阵容完成前，直播端显示空的阵容位置信息以及各队“已提交/未提交”状态，不显示任何阵容内容。 |
| `LINEUP-017` | 已确认 | 自由输入模式的选手名称长度、空白、大小写和特殊字符规则。-> 无规则 |
| `LINEUP-018` | 已确认 | 预设名单模式是否禁止同一选手在双方同时出现。-> 不禁止 |
| `LINEUP-019` | 已确认 | 阵容阶段的三个超时选项及其确定效果。-> 加时重选、判负、管理员决定 |
| `LINEUP-020` | 已确认 | 只有一方未提交且采用本图判负时，未提交方判负。 |
| `LINEUP-021` | 已确认 | 双方均未提交时进入管理员裁定，不自动判定任一方负。 |

## 9. BP 与英雄 Ban

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `BAN-001` | 已确认 | BP 关闭时，跳过全部 Ban 相关 Phase。 |
| `BAN-002` | 已确认 | BP 开启时，每张地图恰好执行两次英雄 Ban。 |
| `BAN-003` | 已确认 | 第一次由先手 Ban 方选择。 |
| `BAN-004` | 已确认 | 第二次由后手 Ban 方选择。 |
| `BAN-005` | 已确认 | 同一张地图的两次 Ban 不能选择同一英雄。 |
| `BAN-006` | 已确认 | 可 Ban 英雄池为完整英雄目录。 |
| `BAN-007` | 已确认 | 不存在“英雄必须上场才能被 Ban”的限制。 |
| `BAN-008` | 已确认 | 不存在目录以外的合法英雄。 |
| `BAN-009` | 已确认 | Ban 优势方由配置决定为优先选择方或非优先选择方。 |
| `BAN-010` | 已确认 | “选择 Ban 先后顺序”开关开启时，优势方可以选择先手或后手。 |
| `BAN-011` | 已确认 | “选择 Ban 先后顺序”开关关闭时，优势方自动成为先手 Ban 方。 |
| `BAN-012` | 继承现状 | 已确认 Ban 不能修改。 |
| `BAN-013` | 已确认 | Ban 选择过程不是秘密信息，按普通可见性公开。 |
| `BAN-014` | 已确认 | Ban 顺序选择超时支持：随机合法顺序、自动先手、自动后手、管理员裁定、延迟后重新选择、本张地图判负；默认自动先手。 |
| `BAN-015` | 已确认 | 第一次和第二次英雄 Ban 共用一个动作超时策略，支持随机合法英雄、延迟后重新选择、本张地图判负、管理员裁定。 |
| `BAN-016` | 已确认 | 随机合法英雄必须同时满足完整英雄目录、同图不重复、后手职责限制和同一方系列赛内不重复 Ban 同一英雄。 |
| `BAN-017` | 已确认 | Ban 顺序选择超时判负方为 Ban 优势方；英雄 Ban 超时判负方为当前应操作方；结果均为本张地图判负。 |
| `BAN-018` | 已确认 | 英雄 Ban 进入管理员裁定后，管理员可以代选合法英雄、由服务端随机选择合法英雄、重新开始选择或判当前操作方本图负。 |
| `BAN-019` | 已确认 | 比赛开始时锁定英雄目录 `catalogHash`；比赛进行中不刷新活动房间的英雄目录。 |
| `BAN-020` | 已确认 | 先手 Ban 英雄的职责被锁定后，后手 Ban 方不能再选择该职责的英雄。 |
| `BAN-021` | 已确认 | 在同一系列赛中，同一方不能再次 Ban 自己此前已经 Ban 过的同一英雄；另一方不受该方历史记录影响。 |
| `BAN-022` | 已确认 | 英雄 Ban Phase 和“随机合法英雄”裁定动作只能在合法英雄候选集合非空时创建；状态机不处理空候选随机。 |

## 10. 比分提交与确认

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `SCORE-001` | 已确认 | 每张地图结束后进入等待比分阶段。 |
| `SCORE-002` | 已确认 | 队伍1或队伍2任意一方均可首先提交比分。 |
| `SCORE-003` | 已确认 | 双方合计只能成功提交一份比分提案。 |
| `SCORE-004` | 已确认 | 双方同时提交时，以服务端首先接受的请求为准。 |
| `SCORE-005` | 已确认 | 首份比分提案成功后，另一方不能再提交另一份比分。 |
| `SCORE-006` | 已确认 | 非提案方可以确认该比分。 |
| `SCORE-007` | 已确认 | 非提案方确认后，该比分成为正式地图结果。 |
| `SCORE-008` | 已确认 | 非提案方可以拒绝该比分。 |
| `SCORE-009` | 已确认 | 比分被拒绝后进入管理员处理。 |
| `SCORE-010` | 已确认 | 管理员可以批准当前比分提案。 |
| `SCORE-011` | 已确认 | 管理员可以重新填写一份比分替代当前提案。 |
| `SCORE-012` | 继承现状 | 正式确认后的比分不可修改。 |
| `SCORE-013` | 已确认 | 地图比分相同视为平局。 |
| `SCORE-014` | 已确认 | 平局消耗一个地图槽位。 |
| `SCORE-015` | 已确认 | 平局不会给任何一方增加系列赛胜图。 |
| `SCORE-016` | 已确认 | 平局后如果系列赛尚未结束，继续下一张地图。 |
| `SCORE-017` | 已确认 | 非平局时，地图比分较高的一方获得一个系列赛胜图。 |
| `SCORE-018` | 已确认 | 地图结算后，如果系列赛继续，先进入场间休息。 |
| `SCORE-019` | 已确认 | 单方地图比分是 `0..99` 的整数。 |
| `SCORE-020` | 已确认 | 负数、小数、空值和大于 99 的值均非法。 |
| `SCORE-021` | 已确认 | 比分提案方不能确认自己的比分。 |
| `SCORE-022` | 已确认 | 管理员可以在尚无队伍提案时直接填写并确认比分。 |
| `SCORE-023` | 已确认 | 比分确认超时策略默认自动确认当前比分提案；也允许配置管理员裁定。 |
| `SCORE-024` | 已确认 | 等待首份比分提案和等待管理员裁定均没有自动超时；只有比分确认阶段具有配置倒计时。 |
| `SCORE-025` | 已确认 | 本张地图判负保存为独立的 `forfeit` 结果，记录胜方、负方、来源 Phase 和原因，不伪造数字比分。 |
| `SCORE-026` | 已确认 | 判负地图在比分展示中将胜方显示为 `W`、负方显示为 `FF`。 |
| `SCORE-027` | 已确认 | 判负地图算作一张非平局胜图，并正常参与系列赛比分以及下一张地图的胜者/败者优先方计算。 |

## 11. 赛制与系列赛结束

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `SERIES-001` | 已确认 | 只支持 FT2、FT3、FT4。 |
| `SERIES-002` | 已确认 | FT2 需要首先获得2张非平局地图胜利。 |
| `SERIES-003` | 已确认 | FT3 需要首先获得3张非平局地图胜利。 |
| `SERIES-004` | 已确认 | FT4 需要首先获得4张非平局地图胜利。 |
| `SERIES-005` | 已确认 | 系列赛一方达到所需胜图数后立即结束。 |
| `SERIES-006` | 已确认 | FTX 的地图槽位上限为 `2X+1`。 |
| `SERIES-007` | 已确认 | FT2 最大5张地图。 |
| `SERIES-008` | 已确认 | FT3 最大7张地图。 |
| `SERIES-009` | 已确认 | FT4 最大9张地图。 |
| `SERIES-010` | 已确认 | 平局数量没有独立的提前终止上限；只要仍有地图槽位且存在下一张合法地图，就继续系列赛。 |
| `SERIES-011` | 已确认 | 第三张或更多平局不会单独触发管理员裁定。 |
| `SERIES-012` | 已确认 | 达到最大地图槽位仍没有自然获胜方时，由管理员决定最终获胜方。 |
| `SERIES-013` | 已确认 | 管理员选定最终获胜方后，系列赛进入结束状态。 |
| `SERIES-014` | 已确认 | 只有地图槽位耗尽且仍未产生自然胜者时，才进入管理员裁定最终系列赛获胜方。 |
| `SERIES-015` | 已确认 | 管理员最终裁定不需要填写原因；审计自动记录裁定来源、管理员、最终胜方和操作时间。 |
| `SERIES-016` | 已确认 | 管理员最终裁定产生结束状态后，是否允许回退由 `rollback.allowAfterCompletion` 决定，默认不允许。 |
| `SERIES-017` | 已确认 | 最终系列赛裁定没有自动超时，可以无限保持等待管理员选择获胜方。 |

## 12. 倒计时与超时

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `TIME-001` | 已确认 | 各业务 Phase 的超时策略由比赛设置指定。 |
| `TIME-002` | 已确认 | 每个超时策略必须使用稳定枚举名称，并在配置目录中列出该 Phase 的全部合法选项。 |
| `TIME-003` | 已确认 | `random_legal_choice` 只从超时发生时由服务端计算出的合法候选中随机。 |
| `TIME-004` | 已确认 | `admin_decision` 进入独立的管理员裁定 Phase；原操作者不能再以普通提交结束该次裁定。 |
| `TIME-005` | 已确认 | `forfeit_map` 的责任方按当前业务操作者确定：地图选择为优先选择方、选边为选边者、单方阵容缺席为未提交方、Ban 顺序为优势方、英雄 Ban 为当前操作方。 |
| `TIME-006` | 已确认 | “延迟后重新选择”清空全部未确认草稿，保持业务 Phase 和 MatchFacts 不变，重新生成 `RoomRuntime` 运行实例并使用 `timeoutExtensionSeconds` 开始新一轮倒计时；响应返回新的 runtime 分段，客户端据此刷新当前页面投影并清空本地草稿。 |
| `TIME-007` | 已确认 | 超时处理与正常提交在单房间串行命令队列中竞争，以服务端首先成功接受并提交状态变化的命令为准。 |
| `TIME-008` | 已确认 | 进入管理员裁定后，原操作者不能继续普通提交；只有管理员裁定命令可以结束该 Phase。 |
| `TIME-009` | 已确认 | 服务端以绝对 `deadlineAt` 表示活动倒计时；重新选择时生成新的 `runtimeId` 并增加 `runtimeSeq`，旧 `runtimeId` 的迟到请求返回 `stale_runtime`。 |
| `TIME-010` | 已确认 | 服务重启导致内存房间消失后不恢复倒计时或活动状态，全部旧请求统一返回 `room_not_found`。 |

### 12.1 管理员裁定

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `RULING-001` | 已确认 | 管理员裁定使用独立的 `AdminDecisionPhase`，记录来源 Phase、地图序号、进入原因和合法裁定动作。 |
| `RULING-002` | 已确认 | 进入管理员裁定时生成新的 `phaseId` 和 `runtimeId`，原 Phase 的普通请求全部失效。 |
| `RULING-003` | 已确认 | 管理员裁定没有自动超时，`allowedActions` 只向管理员开放。 |
| `RULING-004` | 已确认 | 地图选择裁定允许代选合法地图、重新开始选择或判优先选择方本图负。 |
| `RULING-005` | 已确认 | 选边裁定允许代选合法攻防/红蓝方、重新开始选择或判选边方本图负。 |
| `RULING-006` | 已确认 | 单方阵容缺失裁定允许代填缺失方、重新开始或判缺失方本图负；双方均缺失时还允许代填任一方/双方或判任一方本图负。 |
| `RULING-007` | 已确认 | Ban 顺序裁定允许代选先后手、重新开始或判优势方本图负。 |
| `RULING-008` | 已确认 | 英雄 Ban 裁定允许代选合法英雄、随机选择合法英雄、重新开始或判当前操作方本图负。 |
| `RULING-009` | 已确认 | 比分争议裁定允许批准原比分或填写替代比分。 |
| `RULING-010` | 已确认 | 无合法地图或地图槽位耗尽后的系列赛裁定只能选择最终系列赛获胜方。 |

## 13. 暂停与恢复

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `PAUSE-001` | 已确认 | 最终规范需要包含暂停能力。 |
| `PAUSE-002` | 已确认 | 最终规范需要包含恢复能力。 |
| `PAUSE-003` | 已确认 | 房间管理员拥有全局暂停能力。 |
| `PAUSE-004` | 已确认 | 队伍暂停默认启用。 |
| `PAUSE-005` | 已确认 | 全局暂停允许用于所有具有活动倒计时的比赛 Phase，不适用于配置、准备、比赛结束和无倒计时的管理员裁定。 |
| `PAUSE-006` | 已确认 | 队伍只允许在等待比分填写 `score_entry` 和等待比分确认 `score_confirmation` 阶段开始暂停。 |
| `PAUSE-007` | 已确认 | 任一有效暂停存在时，冻结当前活动业务倒计时；展示倒计时由服务端 `RoomRuntime` 推导。 |
| `PAUSE-008` | 已确认 | 双方同时暂停时倒计时仍只冻结一次，但双方各自的暂停次数和时长独立累计。 |
| `PAUSE-009` | 已确认 | 管理员全局暂停与双方队伍暂停可以叠加；所有暂停来源均解除后才恢复业务倒计时。 |
| `PAUSE-010` | 已确认 | 队伍暂停次数、单次时长和累计时长默认均不限制。 |
| `PAUSE-011` | 已确认 | 服务端记录每个暂停来源的开始时间，并在解除时累计时长、重算绝对 `deadlineAt` 和增加 `runtimeSeq`。 |
| `PAUSE-012` | 已确认 | 全局暂停期间禁止普通业务操作，只允许管理员恢复以及不改变比赛状态的读取操作。 |
| `PAUSE-013` | 已确认 | 队伍暂停只冻结比分阶段倒计时，不阻止填写、确认或拒绝比分；对应队伍成功完成比分操作后自动解除该队暂停。 |

## 14. 回退与检查点

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `ROLLBACK-001` | 已确认 | 最终规范需要支持管理员回退。 |
| `ROLLBACK-002` | 已确认 | 回退必须基于明确检查点。 |
| `ROLLBACK-003` | 已确认 | 检查点与地图序号和业务 Phase 绑定，只能回退到后端实际生成的合法检查点。 |
| `ROLLBACK-004` | 已确认 | 前端不得自行构造检查点；后端按锁定配置、当前 MatchFacts 和 Phase 生成可回退检查点列表。 |
| `ROLLBACK-005` | 已确认 | 回退清除目标检查点之后现行比赛分支中的全部地图事实、比分、Ban、阵容、通知和角色私有提交。追加式审计记录不物理删除，而是记录这些后续事实已因回退失效。 |
| `ROLLBACK-006` | 已确认 | 每次成功回退必定增加 `epoch`。 |
| `ROLLBACK-007` | 已确认 | 回退后重新生成 `phaseId`、`runtimeId` 并增加相应版本；回退前的未完成请求必须以 `stale_epoch`、`stale_phase` 或 `stale_runtime` 拒绝。 |
| `ROLLBACK-008` | 已确认 | 回退后的新状态继续按正常可见性规则处理，但系统不承诺让用户忘记曾公开内容，也不显示额外保密警告。 |
| `ROLLBACK-009` | 已确认 | 允许回退跨越已经确认的比分，并按 `ROLLBACK-005` 清除该比分及其后的全部现行分支数据。 |
| `ROLLBACK-010` | 已确认 | 系列赛结束后默认不允许回退。 |
| `ROLLBACK-011` | 已确认 | 回退不需要填写原因；审计必须记录管理员、目标检查点和操作时间。 |

## 15. 可见性与秘密信息

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `VIS-001` | 已确认 | 除阵容提交和互动随机输入外，比赛业务状态默认对所有房间角色可见。 |
| `VIS-002` | 已确认 | 单方阵容提交内容在双方提交完成前不得向对手公开。 |
| `VIS-003` | 已确认 | 互动随机输入在结果公开前不得向对手公开。 |
| `VIS-004` | 已确认 | 管理员在秘密信息公开条件满足前不能查看双方阵容内容或互动随机输入。 |
| `VIS-005` | 已确认 | 直播端可以显示双方阵容“已提交/未提交”状态，但在双方完成前只显示空位置，不显示阵容内容。 |
| `VIS-006` | 已确认 | 公共历史只保存已经成为正式公开事实的阵容；房间在公开前结束或过期时，不保存未公开阵容内容。 |
| `VIS-007` | 已确认 | 公共历史和历史 JSON 不包含互动随机原始输入，也不包含其他尚未公开的秘密提交。 |
| `VIS-008` | 已确认 | 错误响应不得包含对方秘密内容或可以反推出秘密输入的字段。 |
| `VIS-009` | 已确认 | 回退后按新状态重新执行正常可见性规则，但不承诺消除用户已经看见的信息，也不显示额外警告。 |

## 16. 并发、幂等和重试

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `SYNC-001` | 已确认 | 竞争同一个一次性操作时，以服务端首先接受的请求为准。 |
| `SYNC-002` | 已确认 | 后续竞争请求不得覆盖第一次成功结果。 |
| `SYNC-003` | 已确认 | 重复请求只执行第一次。 |
| `SYNC-004` | 已确认 | 网络重试不得产生重复状态变化。 |
| `SYNC-005` | 已确认 | revision 过期本身不应导致合法请求失败。 |
| `SYNC-006` | 已确认 | 每个 Command 必须携带客户端生成的唯一 `commandId`，网络重试必须复用原值。 |
| `SYNC-007` | 已确认 | 相同 `commandId` 重试时返回第一次执行结果，不再次执行领域转换。 |
| `SYNC-008` | 已确认 | 每个 Phase 实例具有唯一 `phaseId`。 |
| `SYNC-009` | 已确认 | revision 可以过期，但已经失效的 `phaseId` 必须拒绝。 |
| `SYNC-010` | 已确认 | 旧 Phase 请求返回 `stale_phase`，而不是作用于新的同类 Phase。 |
| `SYNC-011` | 已确认 | 相同 `commandId` 携带不同命令类型或 payload 时拒绝并返回 `command_id_conflict`。 |
| `SYNC-012` | 已确认 | 单房间命令串行处理，以服务器首先成功验证并提交领域状态变化的命令为准。 |
| `SYNC-013` | 已确认 | 幂等记录保留到活动房间从内存中消失；`commandId` 在单个房间内全局唯一，不按入口分别计算。 |
| `SYNC-014` | 已确认 | 房间消失后，相同 `commandId` 的重试与其他旧入口请求一样返回 `room_not_found`。 |
| `SYNC-015` | 已确认 | 同一房间的业务命令统一串行执行，不同房间可以并行。 |
| `SYNC-016` | 已确认 | 相同命令重试返回首次领域执行结果，并附带基于房间当前状态生成的最新状态核对响应。 |
| `SYNC-017` | 已确认 | 前端只自动重试尚未获得明确结果的在途命令，不在重新进入页面后批量重放旧命令。 |

回退增加 `epoch` 并更换 `phaseId`；超时重选不更换业务 Phase，但会更换 `runtimeId`。两种边界共同防止回退前或上一轮倒计时中的延迟请求污染当前状态。

## 17. 状态模型

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `STATE-001` | 已确认 | Room 不得通过一个包含大量可选字段的巨型 State 在前后端同步。 |
| `STATE-002` | 已确认 | 服务端内部状态拆分为稳定比赛事实 `MatchFacts`、当前 `PhaseState`、`RoomRuntime`、角色私有上下文和浏览器本地 UI。 |
| `STATE-003` | 已确认 | 当前 Phase 使用带 `kind` 判别字段的联合类型。 |
| `STATE-004` | 已确认 | 每种 Phase 只能具有本阶段合法的字段。 |
| `STATE-005` | 已确认 | 已确认地图、阵容、Ban 和比分属于 `MatchFacts`。 |
| `STATE-006` | 已确认 | 当前 Phase 只保存当前操作需要的上下文。 |
| `STATE-007` | 已确认 | 倒计时、在线状态、暂停和重选运行实例属于 `RoomRuntime`。 |
| `STATE-008` | 已确认 | 弹窗、折叠和未提交输入属于浏览器 Local UI；需要保密的已提交内容属于角色私有上下文。 |
| `STATE-009` | 已确认 | 未公开提交不得进入公共状态分段、公共通知或错误响应。 |
| `STATE-010` | 已确认 | 配置和目录通过版本或 hash 引用，避免每次核对重复发送完整内容。 |
| `STATE-011` | 已确认 | 前后端采用“底板 + 状态核对”，不再同步完整 State，也不要求前端回放业务事件来重建权威状态。 |
| `STATE-012` | 已确认 | 服务端按入口角色返回正式 API 契约中的 `allowedActions`。 |
| `STATE-013` | 已确认 | 客户端只渲染服务端返回的有类型状态分段，不在前端运行第二套权威状态机。 |
| `STATE-014` | 已确认 | `RoomRuntime` 使用独立 `runtimeId/runtimeSeq`，不得再依赖完整状态的 revision/hash 引用才能更新。 |
| `STATE-015` | 已确认 | `MatchFacts`、`PhaseState`、`RoomRuntime`、在线状态、私有上下文和通知分别核对版本，任一分段变化不强制重发其他分段。 |

### 17.1 底板与状态核对协议

`BaseboardBundle` 是低频变化、可按 hash 缓存的比赛视图底板，至少包含 `roomId`、入口角色、比赛与队伍显示信息、地图槽位结构、`configVersion/configHash`、`catalogHash`、协议版本和 `boardHash`。配置阶段修改设置时可以更换 `boardHash`；比赛开始后配置和目录锁定。

客户端核对请求 `ClientCheck` 不携带完整状态，只携带：

| 字段 | 作用 |
| --- | --- |
| `epoch` | 标识回退世代。 |
| `boardHash` | 核对底板。 |
| `factsRevision/factsHash` | 核对已确认比赛事实；需要时可以细分为逐地图版本和 hash。 |
| `phaseId` | 核对当前业务 Phase。 |
| `runtimeId/runtimeSeq` | 核对当前倒计时、暂停或重选运行实例。 |
| `presenceSeq` | 核对入口在线状态。 |
| `privateSeq` | 核对当前角色可见的私有上下文。 |
| `notificationCursor` | 增量取得尚未接收的通知。 |

服务器核对响应只有三类：

1. `ok`：各分段一致，仅返回服务器时间或必要的轻量运行信息。
2. `changed`：只替换不一致的有类型分段，例如 `facts`、`phase`、`runtime`、`presence`、`privateContext`、`allowedActions` 或通知。
3. `rebase`：`epoch` 或 `boardHash` 不一致时重新下发底板和当前所需分段，但仍不组成单一完整 State。

分段更新必须使用正式类型的整体分段替换，不采用任意路径 JSON Patch。通知只负责用户提示和审计，不能成为恢复权威状态的唯一来源。中途加入房间的客户端通过 `rebase` 取得底板及当前所需分段。

### 17.2 Command 契约

业务命令至少携带 `commandId`、`epoch`、可选 `phaseId`、涉及计时选择时的 `runtimeId`、命令类型、payload 和可选 `ClientCheck`。服务端使用当前事实重新判断命令是否合法，不得只因为客户端 `factsRevision` 过期而拒绝。命令响应附带一次状态核对结果，只返回发生变化的分段。

## 18. 通知、历史与审计

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `AUDIT-001` | 继承现状 | 成功操作应产生可追踪事件或历史记录。 |
| `AUDIT-002` | 已确认 | 所有成功改变比赛状态的命令都必须写入管理审计；公共比赛历史只投影已经正式公开的比赛事实。 |
| `AUDIT-003` | 已确认 | 无权限、非法配置、命令冲突等失败请求只写服务器安全日志，不写公共比赛历史。 |
| `AUDIT-004` | 已确认 | 管理员代操作、超时裁定、回退和最终裁定必须记录操作者、时间和结果。 |
| `AUDIT-005` | 已确认 | 随机审计记录算法版本和最终结果，不记录互动随机原始输入或随机种子。 |
| `AUDIT-006` | 已确认 | 比赛历史持久化保存，不随活动房间从内存消失而删除。 |
| `AUDIT-007` | 已确认 | 已完成比赛历史在服务重启后永久保留。 |
| `AUDIT-008` | 已确认 | 因不活跃而过期的未完成比赛永久保存已经确认的公开事实和管理审计，状态标记为 `expired`；未公开秘密不进入归档。 |
| `AUDIT-009` | 继承现状 | 业务通知和权威状态应分离。 |
| `AUDIT-010` | 已确认 | 地图、攻防、公开 Ban、正式比分、暂停、回退和比赛结果通知发送给全部房间入口。 |
| `AUDIT-011` | 已确认 | 单方阵容提交只更新角色过滤后的提交状态，不产生公共提示；只有双方都提交后才向全部入口发送“双方阵容已提交”通知，通知不包含具体阵容。 |
| `AUDIT-012` | 已确认 | 进入管理员裁定的通知发送给全部房间入口。 |
| `AUDIT-013` | 已确认 | 字段错误、无权限和命令冲突只返回当前操作者，不进入公共通知流。 |
| `AUDIT-014` | 已确认 | 普通通知按 `notificationDurationSeconds` 展示，默认 20 秒；管理员裁定、全局暂停等阻塞状态由 Phase/Runtime 持续展示，不依赖通知常驻。 |
| `AUDIT-015` | 已确认 | 通知不要求逐条手动确认；客户端使用 `notificationCursor` 表示已接收位置。 |
| `AUDIT-016` | 已确认 | 活动房间最多保留最近 100 条通知；重连补发游标后的通知，落后超过保留窗口时返回 `notification_gap` 并直接按当前状态重新渲染。 |
| `AUDIT-017` | 已确认 | 通知流与永久历史、管理审计分离；通知过期或被回退清理不删除审计记录。 |
| `AUDIT-018` | 已确认 | 互动随机单方提交不产生公共通知；提交方通过命令响应和私有状态确认自己的提交。 |

## 19. 错误语义

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `ERR-001` | 已确认 | Command 不适用于当前 Phase 时返回 HTTP 422、`action_not_allowed`。 |
| `ERR-002` | 已确认 | 有效房间入口的角色无权执行操作时返回 HTTP 403、`action_forbidden`。 |
| `ERR-003` | 已确认 | 一次性操作已经由其他命令完成时返回 HTTP 409、`action_already_resolved`。 |
| `ERR-004` | 已确认 | 失效的 `epoch`、`phaseId`、`runtimeId` 分别返回 HTTP 409 的 `stale_epoch`、`stale_phase`、`stale_runtime`。 |
| `ERR-005` | 已确认 | 结构正确但字段或选择不合法时返回 HTTP 422、`validation_error` 或 `invalid_choice`，并携带不含秘密信息的字段错误。 |
| `ERR-006` | 已确认 | 房间不存在、服务重启后消失或入口失效时统一返回 HTTP 404、`room_not_found`。 |
| `ERR-007` | 已确认 | 相同 Command 的幂等重试返回成功响应并标记 `replayed: true`，不是错误。 |
| `ERR-008` | 已确认 | 管理员裁定 Phase 中的普通队伍请求返回 HTTP 422、`action_not_allowed`。 |
| `ERR-009` | 已确认 | 所有错误响应均按当前入口过滤，不得包含秘密状态、其他入口 token 或内部异常细节。 |
| `ERR-010` | 已确认 | HTTP 与领域错误的正式映射以本节为准，不允许同一领域错误在不同接口任意改变状态码。 |
| `ERR-011` | 已确认 | 业务 Phase 未变化但 `RoomRuntime` 已因重选刷新时，旧 `runtimeId` 的请求返回 `stale_runtime`。 |
| `ERR-012` | 已确认 | 无法解析的请求返回 HTTP 400、`malformed_request`。 |
| `ERR-013` | 已确认 | 创建频率或其他明确配额超限返回 HTTP 429、`rate_limited`。 |
| `ERR-014` | 已确认 | 未预期服务器错误返回 HTTP 500、`internal_error`，响应不包含堆栈或内部对象。 |

## 20. Spec 与实现一致性

| ID | 状态 | 目标规则 |
| --- | --- | --- |
| `SPEC-001` | 已讨论 | 每条正式规则必须具有稳定规则 ID。 |
| `SPEC-002` | 已讨论 | 旧实现只能作为现状证据，不能自动成为目标规范。 |
| `SPEC-003` | 已讨论 | 接口的数据结构应由正式类型系统或 Schema 限制。 |
| `SPEC-004` | 建议 | 使用 TypeSpec 或 OpenAPI 定义 API、Command、Phase 和错误结构。 |
| `SPEC-005` | 建议 | 状态转换通过无 HTTP、无数据库依赖的纯领域函数实现。 |
| `SPEC-006` | 建议 | 每条核心规则至少有一个 Conformance Case。 |
| `SPEC-007` | 建议 | 人类审阅状态转换表和决策表，详细 OpenAPI 和类型文件由机器生成。 |
| `SPEC-008` | 建议 | CI 必须验证 Schema、生成文件、领域测试和前后端契约。 |
| `SPEC-009` | 建议 | 每条审计结论必须附带代码或测试证据。 |
| `SPEC-010` | 建议 | 旧后端行为审计使用隔离的临时 runtime，不接触真实房间数据。 |

## 21. 配置目录

本节列出重构目标中应当存在的全部配置。表中的“默认值”是目标建议值；带“待确认”的默认值不能在产品确认前视为正式规则。

配置分为四层：

1. `PresetMetadata`：配置模板自身的元数据。
2. `MatchConfig`：创建房间时复制、比赛开始时锁定的比赛规则。
3. `SitePolicy`：站点级运行设置，可以影响新请求或所有活动房间。
4. `DeploymentConfig`：环境变量和敏感部署参数，不通过管理 API 公开。

类型约定：

| 类型 | 含义 |
| --- | --- |
| `Side` | `left \| right`。 |
| `MapId` | 地图目录中的稳定 ID。 |
| `ModeId` | 地图模式目录中的稳定 ID。 |
| `HeroId` | 英雄目录中的稳定 ID。 |
| `Seconds` | `1..3600` 的整数秒数。 |
| `OptionalSeconds` | `0..3600` 的整数；`0` 表示不启用倒计时。 |
| `NullableLimit` | 正整数或 `null`；`null` 表示不限制。 |

### 21.1 配置模板元数据

分组：`PresetMetadata`

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `schemaVersion` | 固定正整数 | `1` | 配置文件结构版本，不是比赛版本。 |
| `id` | `string`，`^[a-z0-9][a-z0-9_-]{0,63}$` | 服务器生成 | 模板稳定 ID。 |
| `name` | `string(1..80)` | `"标准比赛"` | 管理页面显示的模板名称。 |
| `description` | `string(0..500)` | `""` | 模板用途和主要规则摘要。 |
| `config` | `MatchConfig` | 标准配置 | 模板包含的完整比赛配置。 |

### 21.2 比赛信息

分组：`MatchConfig.match`

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `matchName` | `string(1..120)` | `"OW Ban Pick Invitational"` | 房间标题和比赛名称。 |
| `teamNames.left` | `string(1..60)` | `"队伍 1"` | 左侧队伍初始名称。 |
| `teamNames.right` | `string(1..60)` | `"队伍 2"` | 右侧队伍初始名称。 |
| `teamsCanEditOwnName` | `boolean` | `false` | 队伍是否能在准备阶段修改并确认自己的名称。 |
| `matchFormat` | `ft2 \| ft3 \| ft4` | `ft3` | 系列赛获胜所需胜图数。 |
| `startPolicy` | `manual \| auto_when_both_ready` | `manual` | 双方准备后由管理员开始，或自动开始。替代旧的 `startWithDefaultConfig`。 |

以下内容不作为可配置字段：最大地图槽位由赛制推导，FT2、FT3、FT4 分别固定为 5、7、9。平局没有独立数量上限；只受地图槽位和合法地图是否存在限制。

### 21.3 时间设置

分组：`MatchConfig.timing`

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `preMatchRestSeconds` | `OptionalSeconds` | `30` | 正式比赛开始后的首图准备倒计时；`0` 表示跳过。 |
| `interMapRestSeconds` | `OptionalSeconds` | `120` | 已结算地图与下一张地图之间的场间休息；`0` 表示跳过。 |
| `interactiveRandomSeconds` | `Seconds` | `30` | 双方提交互动随机输入的时限。 |
| `mapPickSeconds` | `Seconds` | `45` | 选择地图的时限。 |
| `sidePickSeconds` | `Seconds` | `30` | 选择攻防或红蓝方的时限。 |
| `lineupSubmitSeconds` | `Seconds` | `60` | 双方提交阵容的时限。 |
| `banOrderSeconds` | `Seconds` | `25` | Ban 优势方选择先手或后手的时限。 |
| `firstBanSeconds` | `Seconds` | `25` | 先手选择英雄的时限。 |
| `secondBanSeconds` | `Seconds` | `25` | 后手选择英雄的时限。 |
| `scoreConfirmationSeconds` | `Seconds` | `30` | 对方确认或拒绝比分的时限。 |
| `timeoutExtensionSeconds` | `Seconds` | `30` | “延迟后重新选择”生成新 `RoomRuntime` 时使用的新一轮倒计时长度。 |

### 21.4 地图池与地图策略

分组：`MatchConfig.map`

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `mapPool` | `Record<ModeId, MapId[]>` | 当前目录中的全部可用地图，按模式分组 | 本场允许使用的地图；同一模式内不得重复 ID。 |
| `selectionPolicy` | `unique_map \| unique_mode_until_cycle \| first_mode_then_unique_mode \| strict_mode_order \| fixed_map_order` | `first_mode_then_unique_mode` | 地图选择策略。 |
| `firstMapMode` | `ModeId` | `control` | `first_mode_then_unique_mode` 的首图模式。 |
| `modeOrder` | `ModeId[]` | `[control, push, hybrid, escort, flashpoint]` | `strict_mode_order` 按地图序号使用的模式顺序。 |
| `fixedMapOrder` | `MapId[]` | `[]` | `fixed_map_order` 使用的固定地图列表；允许重复，也允许少于 `stageCount` 项并显示风险警告；每项必须存在于当前目录、属于地图池并具有有效地图能力定义。 |
| `fixedFirstMapEnabled` | `boolean` | `false` | 非固定顺序模式下是否直接确定第一张地图。 |
| `fixedFirstMapId` | `MapId \| null` | `null` | 固定首图；启用固定首图时必须存在且属于地图池。 |
| `initialPriorityPolicy` | `system_random \| interactive_random \| left \| right` | `interactive_random` | 首次存在实际消费者时如何确定本系列赛不可变的初始优先选择方。 |
| `subsequentPriorityPolicy` | `previous_loser \| previous_winner` | `previous_loser` | 后续地图按最近非平局地图的败者或胜者确定优先选择方；此前全为平局时使用初始优先选择方。 |
| `mapPickTimeoutPolicy` | `retry_after_delay \| random_legal_map \| forfeit_map \| admin_decision` | `retry_after_delay` | 选择地图超时后的处理。 |
| `interactiveRandomMissingInputPolicy` | `use_zero \| server_random \| admin_decision` | `use_zero` | 互动随机超时时，未提交一方的输入如何产生。 |

非固定顺序模式不重复地图、模式循环完成后开启新循环、无合法地图时进入管理员裁定，属于固定业务规则，不应再做成配置开关。

### 21.5 选边设置

分组：`MatchConfig.sideChoice`

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `firstMapSideChoiceEnabled` | `boolean` | `false` | 所有地图策略通用：首图是否进入主动攻防/红蓝选择；关闭时固定队伍1蓝方/先防守、队伍2红方/先进攻。 |
| `symmetricSideChoiceEnabled` | `boolean` | `false` | 对称地图是否进入红蓝方主动选择。 |
| `chooserRelation` | `priority \| non_priority` | `priority` | 发生主动选边时，由优先选择方或非优先选择方操作。 |
| `timeoutPolicy` | `random_legal_choice \| chooser_blue_defense \| chooser_red_attack \| admin_decision \| retry_after_delay \| forfeit_map` | `chooser_blue_defense` | 选边者超时后的处理。 |

地图使用攻防、红蓝或无选边，来自地图目录的 `sideSelectionKind`，不属于房间配置。

### 21.6 阵容设置

分组：`MatchConfig.lineup`

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `mode` | `free_input \| preset_only \| skip` | `free_input` | 自由填写、只能从预设名单选择，或跳过阵容阶段。 |
| `presetRosters.left` | `string[]` | `[]` | 左队可选成员名称或成员 ID。只在 `preset_only` 下使用。 |
| `presetRosters.right` | `string[]` | `[]` | 右队可选成员名称或成员 ID。只在 `preset_only` 下使用。 |
| `timeoutPolicy` | `retry_after_delay \| forfeit_map \| admin_decision` | `retry_after_delay` | 只有一方未提交时的超时处理。 |
| `bothMissingTimeoutPolicy` | 固定 `admin_decision` | `admin_decision` | 双方都未提交时进入管理员裁定，不自动判定任一方负。 |

阵容人数固定为 5，位置固定为输出、输出、重装、支援、支援，因此 `lineupSlots` 不作为配置。确认后不可修改以及双方完成前保密，也不作为可关闭的设置。

### 21.7 BP 与 Ban 设置

分组：`MatchConfig.ban`

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | 是否启用本图英雄 Ban 流程。 |
| `advantageRelation` | `priority \| non_priority` | `priority` | 由优先选择方或非优先选择方成为 Ban 优势方。 |
| `orderPolicy` | `advantage_chooses \| advantage_must_first` | `advantage_chooses` | 优势方选择先后手，或优势方直接成为先手。 |
| `orderTimeoutPolicy` | `random_legal_order \| advantage_first \| advantage_second \| admin_decision \| retry_after_delay \| forfeit_map` | `advantage_first` | 优势方选择先后手超时后的处理。 |
| `actionTimeoutPolicy` | `random_legal_hero \| retry_after_delay \| forfeit_map \| admin_decision` | `retry_after_delay` | 先手和后手共用的英雄选择超时策略。 |

每方固定 Ban 1 名英雄、同图两名英雄不能重复、后手不能 Ban 先手所选职责、同一方在系列赛内不能重复 Ban 自己已经 Ban 过的英雄，英雄池固定为当前房间目录中的全部英雄。因此 `bansPerSide`、`heroPool` 和这些合法性规则均不作为房间配置。

### 21.8 比分与系列赛设置

分组：`MatchConfig.score`

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `confirmationTimeoutPolicy` | `auto_confirm \| admin_decision` | `auto_confirm` | 对方未在时限内确认或拒绝时的处理。 |

比分固定为 `0..99` 的整数；任一队提交、另一队确认或拒绝、管理员处理争议的流程不是可配置项。`2X+1` 地图槽位和槽位耗尽后管理员决定最终获胜方也是固定规则。

### 21.9 暂停设置

分组：`MatchConfig.pause`

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `globalPauseEnabled` | `boolean` | `true` | 房间管理员是否可以全局暂停当前活动倒计时。 |
| `teamPauseEnabled` | `boolean` | `true` | 队伍是否可以使用本方暂停。 |
| `teamPauseAllowedPhases` | 固定 `[score_entry, score_confirmation]` | `[score_entry, score_confirmation]` | 只允许在等待比分填写和等待比分确认阶段开始队伍暂停。 |
| `teamPauseMaxCountPerMap` | `NullableLimit` | `null` | 每队每张地图允许的暂停次数；`null` 表示不限。 |
| `teamPauseMaxSingleSeconds` | `NullableLimit` | `null` | 单次暂停最长秒数；`null` 表示不限。 |
| `teamPauseMaxTotalSeconds` | `NullableLimit` | `null` | 每队每张地图累计暂停最长秒数；`null` 表示不限。 |

暂停由服务端计时、暂停时冻结活动倒计时、比分提交后立即结束队伍暂停等行为是固定规则，不应做成配置开关。

### 21.10 条件显示与保存校验

| 条件 | 配置页面行为 | 后端保存校验 |
| --- | --- | --- |
| 任意地图策略 | 显示地图池。 | 地图池至少包含 `stageCount` 张不同地图；不足时拒绝保存。 |
| `fixed_map_order` | 额外显示固定地图顺序。 | 允许重复和少于 `stageCount` 项；项数不足时警告但允许保存。任一地图未知、不在地图池中或缺少有效地图能力定义时拒绝保存。 |
| `ban.enabled = false` | 隐藏全部 Ban 子设置。 | 忽略 Ban 子字段，运行时跳过全部 Ban Phase。 |
| 当前设置不会进入主动选边 | 隐藏选边超时策略。 | 忽略对应超时字段，运行时跳过选边 Phase。 |
| 阵容模式不是双方分别提交 | 隐藏阵容提交超时设置。 | 忽略对应超时字段。 |

### 21.11 回退与检查点设置

分组：`MatchConfig.rollback`

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | 是否允许房间管理员执行阶段回退。 |
| `defaultCheckpoints` | `CheckpointKind[]` | `[pre_countdown, map_pick, lineup, ban_order, first_ban, second_ban, score_entry]` | 默认启用的检查点类型。 |
| `mapOverrides` | `Record<MapIndex, CheckpointKind[]>` | `{}` | 针对具体地图序号覆盖可用检查点；空对象表示全部使用默认值。 |
| `allowAfterCompletion` | `boolean` | `false` | 系列赛结束后是否仍允许回退；默认禁止。 |

检查点标签属于前端本地化文案，不进入比赛配置。回退原因不采集；回退清理范围、版本更新和审计字段由固定规则决定，不能由配置任意修改。

## 22. 站点级全局设置

分组：`SitePolicy`

| 配置键 | 类型 | 默认值 | 描述与生效范围 |
| --- | --- | --- | --- |
| `roomsPerHour` | `integer(1..500)` | `5` | 单一客户端地址每小时可以创建的房间数，立即影响新建请求。 |
| `inactiveTimeoutMinutes` | `integer(1..43200)` | `30` | 活动房间连续不活跃多久后关闭。 |
| `notificationDurationSeconds` | `integer(1..300)` | `20` | 普通前端通知默认显示时间。|
| `endTimeoutMinutes` | `integer(1..300)` | `60` | 房间结束后还能访问的时间。|
| `defaultPresetId` | `PresetId \| null` | `null` | 新房间默认复制的比赛配置模板。 |
| `presenceTtlSeconds` | `integer(1..300)` | `5` | 入口最后一次心跳超过多久后显示离线。当前为代码常量，建议显式化。 |
| `historyRetentionDays` | 固定 `null` | `null` | 比赛历史永久保留，不提供自动删除期限。 |
| `catalogRefreshPolicy` | `manual \| scheduled` | `manual` | 英雄与地图目录只允许人工刷新，或由后台计划刷新。 |
| `catalogRefreshIntervalHours` | 正整数或 `null` | `null` | 定时刷新间隔；仅在 `scheduled` 下使用。 |
| `defaultLocale` | BCP 47 字符串 | `zh-CN` | 站点默认显示语言。 |

旧字段 `defaultSettings` 是内联整份默认配置的兼容字段，目标版本应删除，只保留 `defaultPresetId`。

## 23. 部署与敏感配置

分组：`DeploymentConfig`。这些字段来自环境变量或部署 Secret，不允许通过普通设置 API读取。

| 配置键 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `OW_RUNTIME_DIR` | 绝对目录路径 | `backend/data/runtime` | 预设、目录、历史等运行数据位置；测试必须使用临时目录。 |
| `OW_ADMIN_HASH` | Secret string | 首次启动生成 | 全局管理员入口凭证。不得出现在公共状态分段或日志。 |
| `OW_UNLIMITED_CREATE_HASH` | Secret string 或 `null` | `null`（建议） | 绕过创建频率限制的入口；`null` 表示关闭。目标版本不应保留公开的硬编码默认值。 |
| `HOST` | IP/主机字符串 | `0.0.0.0` | 服务监听地址。 |
| `PORT` | `integer(1..65535)` | `5174` | 服务监听端口。 |
| `WORKER_COUNT` | 正整数 | `1` | 当前内存房间模型必须为单 worker；增加 worker 前必须引入跨进程协调。 |
| `LOG_LEVEL` | `debug \| info \| warning \| error` | `info` | 服务端日志等级。 |
| `TRUSTED_PROXY_HOPS` | 非负整数 | `0` | 信任的反向代理层数，用于安全解析客户端地址。 |

## 24. 必须由规则推导、不得配置的内容

以下字段在旧实现中曾经出现为配置，但目标版本不应允许管理员修改：

| 旧字段或概念 | 目标处理 |
| --- | --- |
| `stageCount` | 由 `matchFormat` 推导：FT2=5、FT3=7、FT4=9。 |
| `drawMapReserve` | 删除；平局没有独立数量上限，终止条件由 `stageCount`、自然胜图数和合法地图是否存在共同决定。 |
| `lineupSlots` | 固定为输出、输出、重装、支援、支援。 |
| `bansPerSide` | 固定为每方 1，即每图总计 2 个 Ban。 |
| `heroPool` | 固定引用房间锁定目录中的全部英雄。 |
| `scoreReportMode` | 删除；固定为任一队提交、另一队确认或拒绝，争议交由管理员处理。 |
| `scoreMinimumValue/scoreMaximumValue` | 删除；比分固定为 `0..99` 的整数。 |
| 地图 `sideSelectionKind` | 来自地图目录，不由房间管理员填写。 |
| `configVersion/configHash` | 保存或锁定配置时由服务端生成。 |
| `catalogHash` | 锁定目录时由服务端生成。 |
| `phaseId`、`revision`、`epoch`、`runtimeId/runtimeSeq` | 由状态机和 `RoomRuntime` 生成。 |
| `allowedActions` | 根据角色、Phase、配置和事实推导。 |
| 暂停累计时长和次数 | 根据服务端时间与暂停事件推导。 |
| 系列赛比分和最终获胜方 | 根据地图结果或管理员裁定推导。 |

## 25. 旧配置字段迁移

| 旧字段 | 目标字段或处理 |
| --- | --- |
| `teams.left/right` | `teamNames.left/right`。 |
| `startWithDefaultConfig` | `startPolicy`。 |
| `stageLimits.preStartRestSeconds` | `timing.preMatchRestSeconds`。 |
| `stageLimits.postMatchRestSeconds` | `timing.interMapRestSeconds`。 |
| `stageLimits.mapSelectSeconds` | `timing.mapPickSeconds`。 |
| `stageLimits.playerSelectSeconds` | `timing.lineupSubmitSeconds`。 |
| `stageLimits.firstBanChoiceSeconds` | `timing.banOrderSeconds`。 |
| `stageLimits.firstBanActionSeconds` | `timing.firstBanSeconds`。 |
| `stageLimits.secondBanActionSeconds` | `timing.secondBanSeconds`。 |
| `stageLimits.scoreConfirmSeconds` | `timing.scoreConfirmationSeconds`。 |
| `mapSelectionMode` | `map.selectionPolicy`。 |
| `fixedMapOrderText` | 解析并迁移为结构化 `map.fixedMapOrder: MapId[]`。 |
| `fixedFirstMapName` | `map.fixedFirstMapId`。 |
| `firstMapPickerPolicy` | `map.initialPriorityPolicy`。 |
| `mapPickerPolicy` | `map.subsequentPriorityPolicy`，并将旧“选图方”语义升级为“优先选择方”。 |
| `firstSideChoicePolicy` | 迁移为 `sideChoice.firstMapSideChoiceEnabled`、`sideChoice.chooserRelation`；旧的固定首图结果迁移为关闭主动选边。 |
| `subsequentSideChoicePolicy` | 按旧胜者/败者含义迁移为新的优先方策略与 `sideChoice.chooserRelation`，不能原样保留旧字段。 |
| `presetRosterText` | 解析并迁移为 `lineup.presetRosters`。 |
| `firstBanPolicy` | 拆成 `ban.advantageRelation` 与 `ban.orderPolicy`。 |
| `openingSidePolicy` | 删除；首图 Ban 优势方统一通过初始优先选择方与 `ban.advantageRelation` 推导。 |
| `banTimeoutPolicy` | `ban.actionTimeoutPolicy`；第一、第二次英雄 Ban 共用。 |
| `scoreReportMode` | 删除；比分提案与确认流程固定。 |
| `checkpoints[]` | 迁移为 `rollback.defaultCheckpoints` 与 `rollback.mapOverrides`。 |
| `defaultSettings` | 迁移为一个预设，并将其 ID 写入 `SitePolicy.defaultPresetId`。 |

旧配置导入必须显式执行版本迁移；新后端内部不应长期同时支持两套字段名称。

## 26. 当前最高优先级的缺口

当前已讨论的产品规则、配置字段、默认值、管理员裁定、回退、通知、历史、错误语义和“底板 + 状态核对”协议均已确定，不再存在阻塞 Schema 与后端状态机实现的产品决策缺口。

实现阶段仍必须把本文档转换为正式 Schema、类型定义、状态转换表和 Conformance Cases；如果实现过程中发现本文档无法唯一决定的状态分支，应停止该分支实现并重新补充稳定规则 ID，不得从旧后端行为自行推断目标规则。
