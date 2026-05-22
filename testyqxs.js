/*
# testyqxs v1.1.0

[rewrite_local]
^https:\/\/h5\.youzan\.com\/wscump\/checkin\/.* url script-request-header https://raw.githubusercontent.com/GFeelingh/testyqxs/main/testyqxs.js

[task_local]
55 7 * * * https://raw.githubusercontent.com/GFeelingh/testyqxs/main/testyqxs.js, tag=testyqxs, enabled=true

[mitm]
hostname = h5.youzan.com

用法：
1. 配置 rewrite 捕获 h5.youzan.com/wscump/checkin/* 请求。
2. 手动打开一次小程序签到页，必要时手动点一次签到，让脚本保存登录态。
3. 配置 task_local 定时运行本脚本。
*/

const NAME = "testyqxs";
const VERSION = "1.1.0";
const DISPLAY_NAME = `${NAME} v${VERSION}`;
const STORE_KEY = "testyqxs_cfg";
const CAPTURE_NOTICE_KEY = `${STORE_KEY}_capture_notice`;
const CAPTURE_NOTICE_COOLDOWN_SECONDS = 20;
const RANDOM_DELAY_SECONDS = [60, 300];

const DEFAULTS = {
  appId: "wx92782ef90ebc836d",
  kdtId: "149536603",
  checkInId: "6287727",
};

if (typeof $request !== "undefined") {
  capture();
} else {
  run();
}

function capture() {
  const url = $request.url || "";
  const query = parseQuery(url);
  const headers = $request.headers || {};
  const old = loadConfig();

  const cfg = {
    appId: query.app_id || old.appId || DEFAULTS.appId,
    kdtId: query.kdt_id || old.kdtId || DEFAULTS.kdtId,
    accessToken: query.access_token || old.accessToken || "",
    checkInId: query.checkinId || query.checkin_id || old.checkInId || DEFAULTS.checkInId,
    extraData: getHeader(headers, "Extra-Data") || old.extraData || "",
    userAgent: getHeader(headers, "User-Agent") || old.userAgent || "",
    referer: getHeader(headers, "Referer") || old.referer || "",
    updatedAt: new Date().toISOString(),
  };

  if (!cfg.accessToken) {
    $done({});
    return;
  }

  const existed = !!old.accessToken;
  const changed =
    cfg.accessToken !== old.accessToken ||
    cfg.checkInId !== old.checkInId ||
    cfg.extraData !== old.extraData;

  $prefs.setValueForKey(JSON.stringify(cfg), STORE_KEY);

  notifyCaptureState(existed, changed, cfg);

  $done({});
}

async function run() {
  log(`Version: ${VERSION}`);
  const cfg = loadConfig();
  if (!cfg.accessToken) {
    notify("未找到登录态", "请先打开一次签到页", "确认 rewrite 已启用，并让脚本捕获 h5.youzan.com/wscump/checkin 请求。");
    done();
    return;
  }

  const delaySeconds = randomInt(RANDOM_DELAY_SECONDS[0], RANDOM_DELAY_SECONDS[1]);
  log(`随机延迟已设定：${delaySeconds} 秒。`);
  await countdown(delaySeconds);

  const checkInId = cfg.checkInId || DEFAULTS.checkInId;
  log(`倒计时结束，开始检查签到状态。checkInId=${checkInId}`);
  const common = buildQuery({
    app_id: cfg.appId || DEFAULTS.appId,
    kdt_id: cfg.kdtId || DEFAULTS.kdtId,
    access_token: cfg.accessToken,
  });

  const statusUrl = `https://h5.youzan.com/wscump/checkin/get_activity_by_yzuid_v2.json?checkinId=${encodeURIComponent(checkInId)}&${common}`;
  const signUrl = `https://h5.youzan.com/wscump/checkin/checkinV2.json?checkinId=${encodeURIComponent(checkInId)}&${common}`;

  try {
    const status = await fetchJson(statusUrl, cfg);
    if (status.ok && status.data && status.data.isCheckin === true) {
      log("检查结果：今日已签到。");
      notify("今日已签到", `连续 ${status.data.continuesDay || "-"} 天`, rewardText(status.data.dailyRewards));
      done();
      return;
    }

    const sign = await fetchJson(signUrl, cfg);
    if (!sign.ok || !sign.data || sign.data.success !== true) {
      log(`签到失败：${sign.msg || `HTTP ${sign.statusCode || "-"}`}`);
      notify("签到失败", sign.msg || `HTTP ${sign.statusCode || "-"}`, "可能是登录态过期，请手动打开签到页刷新。");
      done();
      return;
    }

    const awards = Array.isArray(sign.data.list)
      ? sign.data.list.map((item) => item.infos && item.infos.title).filter(Boolean).join("，")
      : "";
    log(`签到成功：${awards || sign.data.desc || "已完成"}，连续 ${sign.data.times || "-"} 天。`);
    notify("签到成功", awards || sign.data.desc || "已完成", `连续 ${sign.data.times || "-"} 天`);
  } catch (err) {
    log(`签到异常：${String(err && err.message ? err.message : err)}`);
    notify("签到异常", String(err && err.message ? err.message : err), "请手动打开签到页刷新登录态后再试。");
  }

  done();
}

function fetchJson(url, cfg) {
  const headers = {
    "content-type": "application/json",
    "User-Agent": cfg.userAgent || "Mozilla/5.0 MicroMessenger",
    "Referer": cfg.referer || "https://servicewechat.com/wx92782ef90ebc836d/17/page-frame.html",
  };
  if (cfg.extraData) headers["Extra-Data"] = cfg.extraData;

  return $task.fetch({ url, method: "GET", headers }).then((resp) => {
    const body = resp.body || "";
    let json;
    try {
      json = JSON.parse(body);
    } catch (err) {
      throw new Error(`响应不是 JSON：${body.slice(0, 80)}`);
    }
    json.statusCode = resp.statusCode;
    json.ok = resp.statusCode >= 200 && resp.statusCode < 300 && json.code === 0;
    return json;
  });
}

function loadConfig() {
  return loadJson(STORE_KEY);
}

function loadJson(key) {
  try {
    return JSON.parse($prefs.valueForKey(key) || "{}");
  } catch (err) {
    return {};
  }
}

function parseQuery(url) {
  const query = {};
  const idx = url.indexOf("?");
  if (idx < 0) return query;
  url.slice(idx + 1).split("&").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq < 0) return;
    const key = decodeURIComponent(part.slice(0, eq));
    const value = decodeURIComponent(part.slice(eq + 1));
    query[key] = value;
  });
  return query;
}

function buildQuery(obj) {
  return Object.keys(obj)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`)
    .join("&");
}

function getHeader(headers, name) {
  const wanted = name.toLowerCase();
  for (const key in headers) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return "";
}

function rewardText(rewards) {
  if (!Array.isArray(rewards)) return "";
  return rewards.map((item) => item && item.desc).filter(Boolean).join("，");
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countdown(seconds) {
  for (let remaining = seconds; remaining > 0; remaining--) {
    log(`倒计时：${remaining} 秒后执行签到。`);
    await sleep(1000);
  }
}

function notifyCaptureState(existed, changed, cfg) {
  if (shouldSkipCaptureNotice()) return;

  if (!existed) {
    notify("登录态已保存", `checkInId: ${cfg.checkInId}`, "现在可以运行定时签到任务。");
    return;
  }

  if (changed) {
    notify("登录态已更新", `checkInId: ${cfg.checkInId}`, "登录信息已刷新。");
    return;
  }

  notify("登录态已获取过", `checkInId: ${cfg.checkInId}`, "当前登录信息没有变化。");
}

function shouldSkipCaptureNotice() {
  const now = Date.now();
  const last = loadJson(CAPTURE_NOTICE_KEY);
  const lastTime = Number(last.time || 0);
  if (lastTime && now - lastTime < CAPTURE_NOTICE_COOLDOWN_SECONDS * 1000) {
    return true;
  }
  $prefs.setValueForKey(JSON.stringify({ time: now }), CAPTURE_NOTICE_KEY);
  return false;
}

function notify(subtitle, message, detail) {
  $notify(DISPLAY_NAME, subtitle || "", [message, detail].filter(Boolean).join("\n"));
}

function log(message) {
  console.log(`[${DISPLAY_NAME}] ${message}`);
}

function done() {
  if (typeof $done !== "undefined") $done();
}
