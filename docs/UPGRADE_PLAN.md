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

---

# 第六轮：删除孤儿页 + 「我的」页体检

## 删除孤儿页

用可达性分析（从 Tab + 引导出发遍历所有 `navigateTo` / `switchTab` 目标）扫出
**5 个**无入口页面，不是 3 个：

| 页面 | 状态 |
|---|---|
| `wallpaper-gallery` / `history` / `mood-curve` | ✅ 已删除（连同 `app.json` 注册与 `profile.wxss` 的死样式） |
| `chat`（树洞） / `wallpaper`（每日壁纸） | ⏸ 保留，等确认 |

`history` 与 `mood-curve` 原本只被 `chat` 引用。删除后 `chat` 顶栏的两个入口会变成
点了没反应的死按钮，已一并摘掉。

`chat` 与 `wallpaper` 各自对应一个完整功能（AI 树洞、每日壁纸），删除等于砍掉功能，
超出「清理孤儿页」的范围，因此保留待定。

## 「我的」页体检结果

### 已修复：四处写死了高考

新数据模型支持高考 / 中考 / 考研 / 考公 / 自定义，但「我的」页仍是旧的单一高考语境：

| 位置 | 问题 | 处理 |
|---|---|---|
| 资料行 | 文案写死「距高考 X 天」 | 改为取 `exam.title`，并支持考试当天 / 考后两种态 |
| 资料行天数 | 回落到 `dateUtil.diffCountdown()` —— 该工具写死 6/7，非高考用户算出来是错的 | 改用 `model.computeExam(exam)` |
| 分享文案 | 「正在用『高三同行』」——旧产品名 + 写死高考 | 改为按考试名生成，并改说「已经走过多少天」 |
| 梦想院校空态 | 「让星语为你写一封来自未来的信」——星语在新 IA 里已无入口，且新的未来信件是用户自己写的，与院校无关 | 改为「点击设置你想去的学校」 |

各类型输出已逐一验证：

```
高考:  四川 · 高三 · 距高考 291 天
中考:  河南 · 距中考 299 天
考研:  北京 · 距考研 114 天
考公:  距考公 101 天
自定义: 距雅思 30 天
当天:  四川 · 高三 · 高考就是今天
考后:  四川 · 高三 · 高考已结束
```

### 已收窄：年级标签

`GRADE_LABEL` 是高考语境的（高一 / 高二 / 高三 / 复读）。中考用户套上去会显示成
「高一」，是错的。在 `profile-edit` 补出初中年级之前，**年级只对高考展示**。

### 待定：信箱入口重复

「我的」页里的「未来的你信箱」卡片，与底部常驻的信箱 Tab 指向同一个页面。
底部 Tab 一直可见，这个卡片是冗余的 —— 但它承担了状态提示
（「有 N 封可以开启了」），去掉会损失一个提醒位。是否移除待定。

---

# 第七轮：砍掉树洞与壁纸

## 删除范围

| 类别 | 删除内容 |
|---|---|
| 页面 | `pages/chat`（树洞）、`pages/wallpaper`（每日壁纸） |
| 云函数 | `chat_send`、`chat_history`、`safety_check`、`wallpaper_today`、`mood_curve` |
| 工具 | `utils/safety-keywords.js`、`cloudfunctions/_shared/`（llm / prompts / safety） |
| 接口 | `api.js` 中 `wallpaperToday` / `chatWelcome` / `chatSend` / `chatHistory` / `chatSession` / `chatFeedback` / `chatDelete` / `moodCurve` |
| 「我的」页 | 信箱卡片（与底部信箱 Tab 重复） |

`mood_curve` 云函数随上一轮删掉的心情曲线页一并清理。
`cloudfunctions/_shared/` 没有任何云函数 `require` 它（代码当初被内联进各函数了），
内容又全是树洞的 prompt 与安全词库，随树洞一起删。

删除后可达性 **14 / 14**，无孤儿页，无悬空事件绑定，无残留引用。

## 重要：代码删除 ≠ 线上删除

这两件事必须手动做，否则线上仍在跑：

1. **云开发控制台里删除已部署的云函数**：`chat_send`、`chat_history`、
   `safety_check`、`wallpaper_today`、`mood_curve`。仓库删掉的只是源码。
2. **`chat_messages` 集合仍存着老用户的树洞对话**。删代码不会删数据。
   要清理需在控制台单独操作 —— 但注意这是用户产生的内容，
   删之前先确认隐私政策与注销流程的承诺是怎么写的。

## 老用户的感知

升级后老用户会发现树洞、壁纸、心情曲线、历史对话都不见了。
这是产品收敛的自然结果，不是缺陷。数据层面没有损失：
`mood_checkins` 仍在（且被复用为打卡记录），`letters` 仍在，`users` 仍在。

## 第八轮：清掉 AI 代写信、补齐三份协议、改名「筑梦倒计时」

### 1. AI 代写信下线（产品决策已定：不留）

删除 `cloudfunctions/letter_generate`、`cloudfunctions/home_init`，
`api.js` 里的 `letterGenerate` / `letterList` / `homeInit` / `updateProfile` / `letterOpen`，
以及 `pages/letter` 的 `generate()` / `regenerate()` / `openEnvelope()` 和整个信封态。

读信页现在只有一个数据来源：`letter_vault`。落款按服务端返回的 `kind` 区分 ——
自己写的信落「过去的你」，旧的 AI 信仍落「星语」。

**旧 AI 信件的读取不受影响**：`letter_vault` 的 `kind='ai'` 分支直接读
`letters.content`，与 `letter_generate` 无关。

顺手清掉 `app.js` 里三个只写不读的字段（`guestChatTurns`、`moodToday`、`daysRemaining`）。

### 2. 三份协议：从占位弹窗变成真正的页面

原来「用户协议 / 隐私政策 / 未成年人保护说明」点开是一个写着
「将在上线前由法务定稿」的 `showModal`。现在：

- 正文放在 `utils/legal.js`，三份文档共用 `pages/legal/legal` 渲染。
- 没有走外链 H5：个人主体没有可信的自有域名，业务域名还要备案，
  内嵌进包里既不依赖外部服务，也不会因域名过期让协议变成 404。

**协议是承诺，不是愿望** —— 所以写之前先对了一遍代码，发现两处对不上，
一并修掉了（见下）。

### 3. 补上协议里承诺、但代码没做的事

| 承诺 | 原来的实现 | 现在 |
|---|---|---|
| 「7 天后彻底删除，无法恢复」 | `user_profile:delete` 只写了个 `deletePending` 标记，**没有任何东西会来读它** | 新增定时触发器（每天 04:00）执行 `purgeExpired()`，跨 6 个集合级联删除后再删 `users` 行 |
| 「冷静期内登录可撤销」 | 无实现 | `login` 分支检测到 `deletePending` 即清除 |
| 「导出你的数据」 | 只导出资料 + 三个计数 | 导出全部打卡、心里话、考试设置与信件清单 |

删除覆盖的集合定义在 `USER_COLLECTIONS` 常量里，包含 `chat_messages`
（旧版树洞对话）。**加新集合时必须同步加进去**，否则「注销即删除」会随功能增加悄悄失效。

定时入口只认 `event.Type === 'Timer'`，不留客户端可调的别名 ——
否则任何用户都能手动触发清理。要手工跑一次，在控制台用 `{"Type":"Timer"}` 测试调用。

信件正文不进导出：解密密钥 `LETTER_SECRET_KEY` 只配在 `letter_vault` 一个函数上，
`user_profile` 再放一份等于把钥匙复制到第二处，还会因两处配置不一致而静默失效。
已开启的信在「信箱」里随时能读，这个口子不值得为它开。

### 4. 去掉两个用不上的权限声明

`app.json` 里声明了 `scope.userLocation` 和 `scope.writePhotosAlbum`，
但全仓库没有任何代码调用 `getLocation` 或 `saveImageToPhotosAlbum`
（壁纸页上一轮已删，省份是手动选的）。声明了却不用，既过不了隐私说明的一致性检查，
也和隐私政策里「不收集位置」自相矛盾。已删除整个 `permission` 段。

### 5. 改名

「高考倒计时 · 高三同行」→ **筑梦倒计时**。关于页同步重写，
并修掉原来 WXML 文本里写 `\n` 想换行的问题（WXML 文本节点里那是两个字面字符，
`white-space: pre-wrap` 也救不了），改成每段一个 view。

### 上线前必须做的事

1. **给 `letter_vault` 配 `LETTER_SECRET_KEY`**（32 位以上随机串，
   如 `openssl rand -base64 48`）。没配的话代码会静默退化成明文落库。
   隐私政策里已经不再声称加密存储，所以这不再是「协议说了做不到」的问题，
   但封存信是产品里最需要用户信任的东西，仍然建议配上。
   注意：有信件之后密钥无法轮换。
2. **重新部署 `user_profile`，并确认定时触发器已生效**（`config.json` 已带）。
   触发器没跑 = 注销承诺没兑现。
3. 云开发控制台删除已废弃的云函数：`chat_send`、`chat_history`、`safety_check`、
   `wallpaper_today`、`mood_curve`、`letter_generate`、`home_init`。

### 关于「加密存储」这句话

隐私政策初稿里写过「数据库里不存在明文」和「AES-256-GCM 加密存储」。
后来删掉了：这两句只有在 `LETTER_SECRET_KEY` 配置好的前提下才成立，
而代码在密钥缺失时是静默退化的 —— 协议不能押在一个可能没做的配置上。

现在保留的是无论密钥配没配都成立的那条承诺：**到期前任何接口都不返回信的正文**，
这条由服务端的日期判断保证，与加密无关。

### 免责

三份协议是按本小程序的实际行为草拟的工程稿，不是法律意见。
正式提交审核前建议找法务或律师过一遍，尤其是未成年人相关条款。

## 第九轮：修云函数时区；首页加可远程开关的推荐位

### 1. 「到日子了却打不开」——云函数跑在 UTC

用户反馈：信件提示 8 月 21 日可以开启，21 日当天点进去仍然提示还没到日子。

根因不是时间限制，是时区。云函数容器的时区是 UTC，不是北京时间。
`new Date().getDate()` 在北京时间 0:00–8:00 之间取到的是**前一天**。
所以凌晨点开一封当天到期的信，服务端认为今天还是 20 号，返回 `still_sealed`。

排查时发现同一个 bug 在三个云函数里各有一份，其中一处比信件更严重：

| 云函数 | 症状 |
|---|---|
| `letter_vault` | 到期当天的凌晨 8 小时内打不开信；`days_left` 多算一天 |
| `mood_checkin` | **北京时间 0:00–8:00 打卡直接失败**。客户端传 21 号，服务端认为今天是 20 号，`delta = -1` 被当成「未来日期」挡掉 |
| `data_sync` | 迁移老用户时 `start_date` 兜底、高考年份推算都可能偏一天 |

修法统一：先把绝对时间平移 +8 小时，再取 UTC 的年月日 ——
`dayKey(d) = fmtUTC(new Date(d.getTime() + 8*3600*1000))`。
这样得到的就是「这个时刻在北京时间属于哪一天」，与容器时区无关。

没有抽成共享模块：云函数各自独立部署，`_shared/` 上一轮已证明是死代码，
再引入一次会重蹈覆辙。三处各留一份带注释的实现。

边界已验证：UTC 15:59 → 北京 20 日，UTC 16:00 → 北京 21 日。
`letter_vault` 8 项、`mood_checkin` 7 项断言在「北京时间 8/21 00:30」的冻结时钟下全通过。

### 2. 首页推荐位（可远程开关）

首页底部新增一个推荐位，视觉沿用数据卡：同样的圆角、同样的左右边距、
同样的字号层级，只是把数字换成名字。不做高亮、不加颜色。

**配置在云端，改配置不需要重新提审。** 数据源是集合 `app_config` 的
`_id = 'promo'` 文档：

```json
{
  "_id": "promo",
  "enabled": false,
  "title": "知识宇宙",
  "desc": "另一个学习工具",
  "action_text": "去看看",
  "url": "https://knowledgeverse.space/"
}
```

集合权限必须设成**「所有用户可读，仅管理员可写」**，否则客户端读不到。
在云开发控制台 → 数据库 → app_config 里改 `enabled` 即时生效。

两条设计约束写进了 `utils/promo.js`：

- **默认关闭，失败即隐藏。** 读不到、读失败、字段缺失、`enabled` 不是布尔
  `true`、URL 不是 https —— 一律不展示。宁可少露一次，也不要因为网络抖动
  或配置写错在用户面前露出半截东西。
- **先用本地缓存渲染再异步刷新。** 否则每次进首页都要等一个网络往返，
  推荐位会在页面上突然弹出来。拉取失败时保留缓存，断网不该让配好的位消失。

**跳转方式是复制链接，不是直接打开。** 小程序打不开外部网页：`web-view`
需要已备案且在后台配置过的业务域名，而**个人主体的小程序根本不支持
`web-view` 组件**。所以点击后把链接复制到剪贴板，弹窗提示用户去浏览器打开。
这是目前唯一走得通的路径。

### 关于用开关规避审核

这个开关的用法需要说清楚。微信《运营规范》禁止「提交审核的版本与实际
线上版本表现不一致」，用后台开关在过审后开启未审核内容，正是该条款针对的
行为，被发现的处置是下架而不是打回。

所以这个开关的正当用途是**运营下架**（对方站点出问题、活动结束、
被投诉时能立刻关掉），不是**审核规避**。
建议提审时就把 `enabled` 打开，让审核员看到真实形态。
外链本身不违规，个人主体小程序做工具间的相互推荐是常见做法。

## 第十轮：白天模式下 tabBar 仍是黑的；信件卡片真的能存了

### 1. tabBar 不跟主题

现象：08:39 打开，页面是浅色，底部 tabBar 还是黑的。

两个原因叠在一起：

- `wx.setTabBarStyle` 在 `onLaunch` 阶段调用会失败 —— 那时 tabBar 还没渲染。
  失败被 `fail: () => {}` 吃掉了，看不出来。
- `refreshTheme()` 只在「主题发生变化」时才调 `applyTheme`。冷启动时算出来的
  主题和默认值相同，于是不走那条分支，tabBar 再也没有被重设过，
  永远停在 `app.json` 的静态配色上。

修法：`applyTabBarTheme` 记录**真正设置成功过的值**（在 `success` 回调里记，
`fail` 里清空），没成功过就一直重试；`refreshTheme()` 每次都调一遍。

同时把默认改成白天：`app.json` 的 `window` 与 `tabBar` 静态配色、
`globalData.theme` 初值都改成浅色。这样 JS 起来之前的第一帧就是浅色的，
冷启动不会先黑一下再变白。

### 2. 信件页排版塌了，「保存为卡片」是个假按钮

截图里两处问题，根子是同一个：

**顶栏顶进了系统状态栏**，和时间、电量叠在一起。
`.page` 是 flex 纵向容器，状态栏占位是个固定高度的空 view，
但 `flex-shrink` 默认是 1 —— 内容一旦超过一屏，这个占位就被压成 0。
而内容之所以超过一屏，是因为 `.paper` 写了 `min-height: 80vh`。

所以修两处：占位和底部操作条都加 `flex: none`，`.stage` / `.letter-scroll`
补 `height: 0`（flex 子项不加这个仍会被内容撑开），
`.paper` 的 `min-height` 从 `80vh` 降到 `320rpx` —— 五个字的信不该撑出大半屏空白纸。

**「保存为卡片」原来只弹一句「卡片生成 V1.1 上线」**，就是截图里那个灰方块。
现在真做了：`utils/card.js` 用 canvas 2d 画图并导出。

几个决定：
- 用 `type="2d"`，不用已废弃的 `wx.createCanvasContext` —— 后者导出时经常
  和真机 DPR 对不上，出来的图是糊的。
- **高度是算出来的**，不是写死的。写死的后果是短信留一大片空白、长信被截断。
- 折行逐字量宽。中文没有词边界，按空格分词那套不成立；
  原文里的换行必须保留，那是写信的人自己分的段。
- 离屏画布用 `left: -2000px` 挪走，不能用 `display: none` ——
  原生组件不参与渲染的话导出来是空白。
- 相册权限被拒不是死路：退回 `previewImage`，用户长按也能存下来。
  比弹一句「保存失败」有用。

`app.json` 里重新声明了 `scope.writePhotosAlbum` —— 上一轮删掉是因为当时
没有任何代码用它，现在真用上了，只声明这一个。

验证：折行与高度计算用假 canvas 跑了 14 项断言，
覆盖短信高度、长信不截断、原文换行保留、DPR 输出、空信不抛异常。

## 已清空：曾经的死代码清单

上一轮列出的四项（`home_init`、`letter_generate`、`pages/letter` 的生成分支、
`api.updateProfile` / `api.letterOpen`）已在第八轮全部删除。
