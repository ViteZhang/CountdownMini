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

---

# 第二轮：已拍板的六条决定

## 1. 老用户考试类型一律迁移成「高考」，不弹确认

旧版本来只做高考，这个假设成立。中考 / 考研用户自行到「我的 → 考试与日期」修改。
**不做**首次进入的类型确认弹窗 —— 会打断，且入口找得到。

## 2. 未来信件封存机制：做到位

「封存后不可查看、不可修改」这条，靠客户端不渲染是做不到的 —— 数据导出、调试面板、
直接翻数据库都能绕过。因此封存的权威放在服务端：

| 环节 | 做法 |
|---|---|
| 存储 | 正文 **AES-256-GCM 加密**落库，密钥来自云函数环境变量 `LETTER_SECRET_KEY`。翻数据库只看得到密文 |
| 客户端 | 写完即丢。本地**永不保留**封存中的正文，连缓存都不写 |
| 列表 | `letter_vault:list` **任何分支都不返回正文**，只回状态与元数据 |
| 开启 | `letter_vault:open` 由服务端校验 `open_at`，未到期返回 `still_sealed`，不带任何可推断正文的信息 |
| 修改 | **没有 update 正文的入口** —— 封存后改都改不了，只能整封删除 |
| 删除 | 允许，二次确认，未开启的信文案额外强调「永远消失」 |

**开启节点**（`open_at` 由考试日期推算）：

| trigger | 计算 |
|---|---|
| `d100` / `d50` | `target_date − 100 / −50` |
| `night_before` | `target_date − 1` |
| `result_day` | `target_date + 23`（多数省份考后约 23 天出分） |
| `custom` | 用户自选，最早为明天 |

用户改考试日期时，`data_sync:save_exam` 会顺带调用 `letter_vault:reschedule`，
重算所有**未开启的预设节点**信件的 `open_at`；**自定义日期的信不动**（PRD 5.6 边界情况）。

> 代价要说清楚：信件是全 App **唯一必须联网**的功能。这是「封存」这个语义换来的，
> 没有别的做法能同时满足 local-first 和真正的不可查看。

## 3. 分享卡片：接受小程序降级路径

App 版是「节点日自动弹卡 + 导出 1080×1440 存相册」。小程序没有后台唤起能力，降级为：
canvas 绘制 + `saveImageToPhotosAlbum`，**只能在用户主动打开小程序时触发**节点卡。
留到 P2 实现。

## 4. 主题：默认跟随时间，手动入口移出右上角

- 默认 `auto`：**6:00–17:59 浅色，18:00–5:59 深色**，每次页面 `onShow` 复算
- 手动选了「日间 / 夜间」后固定，不再随时间变
- tabBar 通过 `wx.setTabBarStyle` 跟着换色
- 原首页右上角的 ◐ **已移除** —— 那个位置会被微信胶囊按钮遮挡。
  手动切换收到「我的 → 外观」

## 5. 「我的」收起为一个入口

- tabBar 从 3 项收到 **2 项**（倒计时 / 记录）
- 入口放在**首页底部**，一行安静的「我的 · 院校 · 信箱 · 外观 · 设置」

**为什么放首页底部**：顶部右上角被微信胶囊占死；顶部左侧是考试名，不该抢；
记录页放设置在信息架构上说不通。首页很短，滚到底就能看到，且符合 PRD
「设置不该抢戏」的意图。

「我的」页内新增三行：**外观**（跟随时间 / 日间 / 夜间）、**考试与日期**、**设置**。

## 6. 小组件：小程序端不做

**微信小程序没有 iOS / Android 桌面小组件能力**，这是平台硬限制，不是实现难度问题。
PRD 5.10 把小组件列为「最重要的触达通道」，这一条在小程序端无法等价实现。

已拍板：**小程序端不做小组件，也不做它的替代方案**（订阅消息、引导添加到「我的小程序」
等一概不做）。触达能力整体留到 App 端。

对后续判断的影响：小程序这一版的定位因此收窄为**产品验证**——验证「已走过 / 今天也在 /
未来信件」这套内核是否成立，而不是验证留存机制。留存的核心抓手（小组件）只有 App 能提供，
所以小程序的次月留存数据不宜直接外推到 App。

---

# 第三轮：交互对齐与主题贯通

## 信息架构：回到交互设计图的三 Tab

tabBar = **倒计时 / 记录 / 信箱**，与交互原型一致。信箱从二级页升为 Tab 页
（去掉返回按钮，所有入口改用 `switchTab`）。

「我的」收到**首页右上角**一个图标。位置刻意下移到状态栏下方 `96rpx` ——
微信胶囊按钮占据状态栏下方约 `64rpx`，不让开就会被压住。图标用纯 CSS 画的小人，
跟随主题变色，不需要额外切图。

## 进度环与成长树：从 canvas 换成纯 CSS

**首页滑动时进度环不跟随滚动，是因为 `canvas` 是原生组件**——它渲染在独立层级上，
在 `scroll-view` 里不参与滚动。这不是样式问题，改 CSS 修不好，必须换掉 canvas。

进度环改为**双半圆窗口 + 旋转半环**：

```
右窗覆盖 0–50%，左窗覆盖 50–100%，起点 12 点方向、顺时针
半环着色跨度 180°，右窗可见区间 [0°,180°]
令着色区间右端 = 360p  →  rightDeg = 360p − 135
左窗同理                →  leftDeg  = 360p − 315
```

已逐点校验（p = 0 / .25 / .5 / .75 / .814 / 1），弧终点与 `360p` 完全吻合。

成长树同样改为纯 CSS：主干高度 + 1～3 个树冠圆，尺寸由阶段序号驱动，
`bloom` 阶段树冠填实。形态仍然只与 `progress` 有关，与打卡无关。

> `pages/mood-curve` 与 `pages/wallpaper` 仍使用 canvas，但它们不在 `scroll-view` 内，
> 没有同样的问题，保持原样。

## 主题贯通到全部老页面

新增 `utils/theme.js`，页面 `onShow` 调 `theme.apply(this, customNav)`：
注入 theme class，并对使用系统导航栏的页面调 `wx.setNavigationBarColor` ——
否则深色页面顶上会顶着一条白色导航栏。

已接入的 11 个页面：设置 / 关于 / 意见反馈 / 我的数据 / 个人资料 / 我的 /
省份 / 院校 / 历史对话 / 心情曲线 / 壁纸收藏。这些页面的 WXSS 原本全是硬编码色，
已系统性替换为主题 token，并补充 `--cd-danger`、`--cd-accent` 两个语义变量。

## tabBar 图标：一套就够

**结论：不需要两套。** 关键在于选色，而不是数量：

| 状态 | 颜色 | 为什么一套够用 |
|---|---|---|
| 未选中 | `#7A828C` 中性灰 | 在 `#101114` 和 `#FAFAF8` 上对比度都足够 |
| 选中 | `#6E9480` 品牌绿 | 同上，且与产品的绿色成长物同源 |

要**两套**的唯一情形是图标做成纯黑白单色 —— 黑图标在深色底上会消失，白图标在浅色底上会消失。
只要避开纯黑白，一套图标 + `wx.setTabBarStyle` 换背景色就够了。

图标文件（200×200 PNG，透明底）：

```
images/tab/home.png            home-actived.png
images/tab/record.png          record-actived.png
images/tab/letter.png          letter-actived.png
```

仓库里当前是按上述配色生成的占位图，可直接覆盖。
`mine.png` / `mine-actived.png` / `chat*.png` 已不再被 tabBar 使用。

---

# 第四轮：图标统一与返回路径修复

## 首页 Tab 图标

`home.png` / `home-actived.png` 换成同一套画法的钟面（圆环 + 时针分针），
与 `record` / `letter` 形制、线宽、配色一致。三个 Tab 现在是同一套视觉语言。

## 返回路径：custom 导航页必须自己画返回键

**`navigationStyle: custom` 的页面，微信不提供系统返回键。** 页面不自己画一个，
用户进去就出不来 —— iOS 侧滑返回不可发现，且从 Tab 页跳过来时页面栈可能只有一层，
侧滑也无效。

全量排查了所有页面，实际存在的问题有三处：

| 页面 | 问题 | 处理 |
|---|---|---|
| 我的 | custom 导航 + 无返回键，**进去出不来** | 顶栏左侧加返回键 |
| 引导（编辑模式） | 第 1 屏返回键被 `hide`，同样出不去 | 编辑模式下第 1 屏显示返回键，点击退出页面 |
| 树洞 | custom 导航 + 无返回键 | 补上返回键（该页当前无入口，属预防性修复） |

使用系统导航栏的页面（设置 / 关于 / 反馈 / 我的数据 等）由微信自带返回箭头，不受影响。

新增 `utils/nav.js`：`nav.back(fallback)` 先 `navigateBack`，
页面栈只剩一层时回落到指定 Tab，再不行 `reLaunch`。
`pages/letter` 与 `pages/wallpaper` 里原本裸调 `wx.navigateBack()`
（栈只剩一层时会静默失败）也一并接入。

## 顺带修掉的遮挡问题

「我的」页顶栏右上角原本有一个 ⚙ —— 那正是微信胶囊按钮的位置，会被压住。
已移除，该入口在页面下方的菜单里已经有了。右上角现在留空。

---

# 第五轮：日历填充态与「我的」瘦身

## 打卡当天的日期数字消失

**根因是 CSS 优先级，不是渲染问题。** 原来的顺序是：

```css
.day.has   { background: var(--cd-t1); color: var(--cd-bg); }
.day.today { box-shadow: inset 0 0 0 1rpx var(--cd-t2); color: var(--cd-t1); }
```

两条选择器优先级相同（0,2,0），后写的赢。当天打卡后 `has` 与 `today` 同时命中，
`color` 被 `.today` 覆盖回深色，于是深底深字 —— 数字还在，只是看不见了。

改为把 `.today` 提到最前，并让填充态清掉描边：

```css
.day.today { box-shadow: inset 0 0 0 1rpx var(--cd-t2); color: var(--cd-t1); }
.day.back  { background: var(--cd-line); color: var(--cd-t1); box-shadow: none; }
.day.has   { background: var(--cd-t1);  color: var(--cd-bg); box-shadow: none; }
```

语义也更正确：`today` 只表示「今天但还没打卡」的描边提示，一旦打卡就让位给填充态。

## 「我的」页瘦身

暂时移除四块内容：**我的陪伴（统计卡）/ 我的心情曲线 / 我的历史对话 / 我保存的壁纸**。

连带清理：`loadStats()` 及其云函数请求（统计卡没了就不必再发）、
`goMoodCurve` / `goHistory` / `goWallpapers` / `goAchievement` 四个已无引用的方法。

页面现在只剩：用户卡片 · 梦想院校 · 信箱 · 菜单（外观 / 考试与日期 / 设置）· 邀请。

> 因为是「暂时」移除，`pages/wallpaper-gallery`、`pages/history`、`pages/mood-curve`
> 三个页面仍保留在 `app.json` 中，`profile.wxss` 里的 `.stats-card` 样式也留着 ——
> 想恢复时只需把 WXML 片段加回去，不用重写。
> 这三个页面目前已无任何入口。
