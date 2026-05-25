# testyqxs

Quantumult X task/rewrite script.

## IT签到

新增脚本：`testqitx.js`

### 已确认接口

Stream 抓包和页面脚本确认 IT之家签到页使用：

```text
GET https://napi.ithome.com/api/usersign/getsigninfo
GET https://napi.ithome.com/api/usersign/sign
```

关键参数：

```text
userHash = Bearer ...
```

页面逻辑是先查询 `getsigninfo`，如果返回 `issign=false`，再请求 `sign` 完成签到。

### QX 配置

#### 方式一：资源解析器导入

在 QX 的资源页面添加下面这个链接，并开启资源解析器：

```text
https://raw.githubusercontent.com/GFeelingh/testyqxs/main/testqitx.js
```

脚本顶部已经内置 `[rewrite_local]`、`[task_local]` 和 `[mitm]` 规则，资源解析器可以直接识别。

#### 方式二：手动配置

```ini
[rewrite_local]
^https:\/\/napi\.ithome\.com\/api\/usersign\/(?:getsigninfo|sign)(?:\?|$) url script-request-header https://raw.githubusercontent.com/GFeelingh/testyqxs/main/testqitx.js

[task_local]
20 8 * * * https://raw.githubusercontent.com/GFeelingh/testyqxs/main/testqitx.js, tag=testqitx, enabled=true

[mitm]
hostname = napi.ithome.com
```

### 使用步骤

1. 开启 QX、Rewrite、MitM。
2. 在 IT App 内打开一次签到页。
3. 看到“登录态已保存 / 已更新 / 已获取过”通知后，就可以运行定时任务。
4. 今天已签到时，脚本会通知当前连续签到、累计签到和金币数。
5. 明天未签到状态下再运行一次，用来验证 `sign` 接口的成功响应。

定时任务会在每天 08:20 触发，脚本内部再随机等待 1-5 分钟后执行，实际时间约为 08:21-08:25。等待期间 QX 日志会每秒显示剩余倒计时。

不要上传包含完整 `userHash` / `Bearer` 的 HAR、截图或配置。

当前版本：`1.1.0`

## 1.1.0 更新

- 打开签到页时会提示登录态状态：
  - 首次捕获：`登录态已保存`
  - 登录信息变化：`登录态已更新`
  - 登录信息相同：`登录态已获取过`
- 为避免一次页面加载触发多条请求导致连续弹窗，登录态提示有 20 秒防抖。
- 定时任务触发后，会在 QX 日志里每秒输出倒计时，例如：`倒计时：120 秒后执行签到。`

## 已确认接口

Stream 抓包确认真正签到接口是：

```text
GET https://h5.youzan.com/wscump/checkin/checkinV2.json
```

关键参数：

```text
app_id = wx92782ef90ebc836d
kdt_id = 149536603
checkinId = 6287727
```

## QX 配置

### 方式一：资源解析器导入

在 QX 的资源页面添加下面这个链接，并开启资源解析器：

```text
https://raw.githubusercontent.com/GFeelingh/testyqxs/main/testyqxs.js
```

脚本顶部已经内置 `[rewrite_local]`、`[task_local]` 和 `[mitm]` 规则，资源解析器可以直接识别。

### 方式二：手动配置

把脚本放到 QX 可访问的位置后，添加：

```ini
[rewrite_local]
^https:\/\/h5\.youzan\.com\/wscump\/checkin\/.* url script-request-header testyqxs.js

[task_local]
55 7 * * * testyqxs.js, tag=testyqxs, enabled=true

[mitm]
hostname = h5.youzan.com
```

如果你使用远程脚本链接，把上面的 `testyqxs.js` 替换为实际脚本 URL。

GitHub 远程示例：

```ini
[rewrite_local]
^https:\/\/h5\.youzan\.com\/wscump\/checkin\/.* url script-request-header https://raw.githubusercontent.com/GFeelingh/testyqxs/main/testyqxs.js

[task_local]
55 7 * * * https://raw.githubusercontent.com/GFeelingh/testyqxs/main/testyqxs.js, tag=testyqxs, enabled=true
```

## 使用步骤

1. 开启 QX、Rewrite、MitM。
2. 打开目标小程序签到页。
3. 让 rewrite 捕获一次 `h5.youzan.com/wscump/checkin/*` 请求。
4. 看到“登录态已保存 / 已更新 / 已获取过”通知后，就可以运行定时任务。

登录态过期时，重新打开一次签到页即可刷新。

定时任务会在每天 07:55 触发，脚本内部再随机等待 1-5 分钟后签到，实际签到时间约为 07:56-08:00。等待期间 QX 日志会每秒显示剩余倒计时。

不要上传 HAR 抓包文件、QX 导出的完整请求、包含 `access_token` 的链接或截图。
