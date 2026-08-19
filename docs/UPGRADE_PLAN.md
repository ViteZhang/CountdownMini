# CountdownMini 升级方案 · 从「高三同行」到「备考倒计时」

> 目标：复用线上已有数据结构，只做**加字段 / 加表**，不删不改旧字段，保证线上用户升级后
> 昵称、省份、梦想院校、心情打卡、AI 信件全部还在，并且旧的心情打卡能**直接变成新的「累计坚持天数」**。
> 登录方式不变：仍为微信 openid（`user_profile` 云函数）。

---

## 一、现状盘点

| 层 | 现状 |
|---|---|
| 形态 | 微信小程序 + 云开发（cloud1-d3g1s5sxr76d39626） |
| 集合 | `users` / `mood_checkins` / `chat_messages` / `letters` / `feedbacks` |
| 登录 | `user_profile { action:'login' }` → openid 建档，昵称头像走 chooseAvatar |
| 首页 | 高考写死（6/7）、心情五档打卡、壁纸、金句、树洞入口 |
| Tab | 倒计时 / 我的 |

## 二、目标形态（PRD V1）

核心转向：**「还剩多久」→「你已经走了多远」**。
新增三个不可缺的概念：`start_date`（起始日期）、`progress`（已走过比例）、`CheckIn`（今天也在）。

## 三、数据结构映射（兼容策略）

### 3.1 新增集合 `exams`

| 字段 | 类型 | 说明 |
|---|---|---|
| _openid | string | |
| type | enum | gaokao/zhongkao/kaoyan/kaogong/custom |
| title | string | 展示名 |
| start_date | date(YYYY-MM-DD) | **核心新字段** |
| target_date | date(YYYY-MM-DD) | |
| province | string? | 复用旧 users.province.name |
| is_primary | bool | |
| createdAt / updatedAt | | |

**老用户迁移**：首次进入新版时，用 `users.province` + 高考年份自动生成一条
`type='gaokao'` 的 primary exam。`start_date` 回落规则（取最早者）：
`min(用户最早的 mood_checkins.date, users.createdAt)`，无数据则取「目标年份−3 的 9/1」，
仍晚于今天则回落为今天。→ 老用户升级后立刻就有一个真实的「你已走过 N 天」。

### 3.2 复用 `mood_checkins` 作为 CheckIn（加字段）

| 新增字段 | 说明 |
|---|---|
| exam_id | 归属考试 |
| is_backfill | 是否补签 |
| checked | bool，恒 true；旧数据视为 true |

**关键兼容点：一条 `mood_checkins` 记录 = 那天打过卡。** `mood_level` 保留为可选字段
（新版打卡不再强制选心情，但旧数据的心情曲线仍可用）。老用户的累计天数 = 旧记录条数，不归零。

### 3.3 新增集合 `notes`（心里话）

旧 `chat_messages` 是树洞对话，语义不同，不复用。新建 `notes`：
`{_openid, exam_id, date, content(≤200), createdAt, updatedAt}`。

### 3.4 复用 `letters`（加字段）

| 新增字段 | 说明 |
|---|---|
| kind | `'ai'`（旧的 AI 代写信）/ `'self'`（新的未来信件） |
| open_at / open_trigger | 封存开启日期与节点 |
| is_opened / opened_at | |
| written_at | |

旧数据无 kind 视为 `'ai'` + `is_opened=true`，信箱里照常可读。

### 3.5 `users` 加字段

`schema_version`、`primary_exam_id`、`theme`（auto/light/dark）、`migrated_at`。

> 全部为**增量加字段**，任何一次读取都对 `undefined` 做兜底，旧客户端继续跑不受影响。

## 四、分期

| 期 | 内容 | 状态 |
|---|---|---|
| **MVP（本次）** | 数据层 + 迁移、4 屏引导、新首页（进度环/已走过/成长树/今天也在/心里话）、记录页（日历+时间线+14天补签）、深色模式 | ✅ 本次交付 |
| P2 | 未来信件封存机制、三类分享卡 + 节点触发 | 待做 |
| P3 | 同考人数（1 万阈值）、皮肤解锁、考后接力 | 待做 |
| 不做 | 注册墙、排名、连续打卡清零、成绩录入、备考期广告 | 永不做 |

## 五、MVP 交付清单

**新增**
- `utils/model.js` — 考试类型/默认日期/progress/成长阶段/日期工具
- `utils/store.js` — local-first 存储 + 版本迁移 + 云端合并
- `pages/record/*` — 记录页（日历 + 心里话时间线）
- `cloudfunctions/data_sync/` — 拉取/合并 exam + checkins + notes

**改造**
- `app.js` — 启动即迁移、全局 exam 状态、主题
- `app.wxss` — 双主题设计 token（沿用原型的 #101114 / #FAFAF8 体系）
- `app.json` — Tab 三项（倒计时 / 记录 / 我的）
- `pages/onboarding/*` — 3 屏轮播 → 4 屏配置流（类型 → 目标日 → 起始日 → 第一次看见数字）
- `pages/home/*` — 环形进度 + 「你已走过 X 天」+ 成长树 + 「今天也在」+ 心里话弹层
- `cloudfunctions/mood_checkin/` — 支持 exam_id / 补签 / 心里话，mood_level 变可选
- `cloudfunctions/home_init/` — 一并返回 exam、累计天数、心里话数

**不动**（保证线上用户功能不缺失）
登录链路（`utils/auth.js` + `user_profile`）、profile / settings / letter / letter-box /
wallpaper / chat 等页面与云函数全部保留。

## 六、迁移执行顺序（客户端）

```
onLaunch
 └ store.boot()
    ├ 读 cd_schema_version
    ├ =0（老用户/新装）→ migrateFromLegacy()
    │   ├ 读 app_state（province/examYear/examDate）
    │   ├ 建 primary exam（gaokao，target=examYear-06-07）
    │   └ 标记 pendingCloudMigrate=true
    ├ =2 → 直接读本地
    └ 登录态下 data_sync 拉云端 → 取并集合并（打卡取并集，心里话按 updatedAt 后写胜）
```

迁移**幂等**：以 `schema_version` 为闸门，重复执行不会重复建 exam。
同步失败不阻塞任何功能（local-first），静默重试。

## 七、验收标准

1. 线上老用户升级后：昵称/省份/梦想院校/AI 信件全部在；首页「累计坚持」= 其历史心情打卡天数。
2. 全程不登录可用完整 MVP 功能；登录后本地数据上行合并、不丢。
3. 断更 30 天后打开，首页无任何指责性文案，累计天数不变。
4. 连续 30 天不打卡，树的阶段仍随日期推进。
5. 冷启动到首页可见 < 1s；无网络时首页正常渲染。
