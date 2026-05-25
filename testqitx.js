/*
# testqitx v0.1.0

[rewrite_local]
^https:\/\/napi\.ithome\.com\/api\/usersign\/(?:getsigninfo|sign)(?:\?|$) url script-request-header https://raw.githubusercontent.com/GFeelingh/testyqxs/main/testqitx.js

[task_local]
20 8 * * * https://raw.githubusercontent.com/GFeelingh/testyqxs/main/testqitx.js, tag=testqitx, enabled=true

[mitm]
hostname = napi.ithome.com

用法：
1. 开启 QX、Rewrite、MitM。
2. 在 IT之家 App 内打开一次签到页，让脚本捕获 userHash。
3. 运行定时任务或手动执行本脚本。
*/

const NAME = "IT之家签到";
const VERSION = "0.1.0";
const DISPLAY_NAME = `${NAME} v${VERSION}`;
const STORE_KEY = "testqitx_cfg";
const CAPTURE_NOTICE_KEY = `${STORE_KEY}_capture_notice`;
const CAPTURE_NOTICE_COOLDOWN_SECONDS = 20;
const RANDOM_DELAY_SECONDS = [60, 300];

const API = {
  getSignInfo: "https://napi.ithome.com/api/usersign/getsigninfo",
  sign: "https://napi.ithome.com/api/usersign/sign",
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
    userHash: query.userHash || query.userhash || old.userHash || "",
    userAgent: getHeader(headers, "User-Agent") || old.userAgent || "",
    accept: getHeader(headers, "Accept") || old.accept || "application/json, text/plain, */*",
    acceptLanguage: getHeader(headers, "Accept-Language") || old.acceptLanguage || "zh-CN,zh-Hans;q=0.9",
    updatedAt: new Date().toISOString(),
  };

  if (!cfg.userHash) {
    $done({});
    return;
  }

  const existed = !!old.userHash;
  const changed = cfg.userHash !== old.userHash || cfg.userAgent !== old.userAgent;
  $prefs.setValueForKey(JSON.stringify(cfg), STORE_KEY);
  notifyCaptureState(existed, changed);
  $done({});
}

async function run() {
  log(`Version: ${VERSION}`);
  const cfg = loadConfig();
  if (!cfg.userHash) {
    notify("未找到登录态", "请先打开一次 IT之家签到页", "确认 rewrite 已启用，并捕获 napi.ithome.com/api/usersign 请求。");
    done();
    return;
  }

  const delaySeconds = randomInt(RANDOM_DELAY_SECONDS[0], RANDOM_DELAY_SECONDS[1]);
  log(`随机延迟已设定：${delaySeconds} 秒。`);
  await countdown(delaySeconds);

  try {
    const info = await fetchJson(`${API.getSignInfo}?userHash=${encodeURIComponent(cfg.userHash)}`, cfg);
    log(`签到状态：issign=${info.issign}, 连续=${info.cdays}, 累计=${info.mdays}, 金币=${info.totalcoin}`);

    if (info.issign === true) {
      notify("今日已签到", `连续 ${valueOrDash(info.cdays)} 天，累计 ${valueOrDash(info.mdays)} 天`, `金币：${valueOrDash(info.totalcoin)}，补签卡：${valueOrDash(info.recount)}`);
      done();
      return;
    }

    const sign = await fetchJson(`${API.sign}?userHash=${encodeURIComponent(cfg.userHash)}`, cfg);
    if (Number(sign.ok) !== 1) {
      const message = sign.msg || sign.message || JSON.stringify(sign).slice(0, 120);
      log(`签到失败：${message}`);
      notify("签到失败", message, "可手动打开签到页确认登录态是否过期。");
      done();
      return;
    }

    const reward = formatSignReward(sign);
    log(`签到成功：${reward}`);
    notify("签到成功", reward, `连续 ${valueOrDash(sign.cdays)} 天`);
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    log(`签到异常：${message}`);
    notify("签到异常", message, "请重新打开 IT之家签到页刷新登录态后再试。");
  }

  done();
}

function fetchJson(url, cfg) {
  const headers = {
    "Accept": cfg.accept || "application/json, text/plain, */*",
    "Accept-Language": cfg.acceptLanguage || "zh-CN,zh-Hans;q=0.9",
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": cfg.userAgent || "Mozilla/5.0 iPhone IT之家",
  };

  return $task.fetch({ url, method: "GET", headers }).then((resp) => {
    const body = resp.body || "";
    let json;
    try {
      json = JSON.parse(body);
    } catch (err) {
      throw new Error(`响应不是 JSON：${body.slice(0, 120)}`);
    }
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw new Error(`HTTP ${resp.statusCode}：${body.slice(0, 120)}`);
    }
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

function getHeader(headers, name) {
  const wanted = name.toLowerCase();
  for (const key in headers) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return "";
}

function notifyCaptureState(existed, changed) {
  if (shouldSkipCaptureNotice()) return;
  if (!existed) {
    notify("登录态已保存", "已捕获 userHash", "现在可以运行 IT之家签到任务。");
    return;
  }
  if (changed) {
    notify("登录态已更新", "userHash 已刷新", "可以继续使用定时任务。");
    return;
  }
  notify("登录态已获取过", "当前登录信息没有变化", "无需重复操作。");
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

function formatSignReward(sign) {
  if (sign.title && sign.message && typeof sign.message === "object") {
    const details = Object.keys(sign.message)
      .map((key) => {
        const value = sign.message[key];
        if (value === null || value === "") return key;
        return key === "null1" ? String(value) : `${key}${value}`;
      })
      .filter(Boolean)
      .join("，");
    return details ? `${sign.title}：${details}` : sign.title;
  }
  if (sign.coin !== undefined) return `获得 ${sign.coin} 金币`;
  return sign.msg || sign.message || "已完成";
}

function valueOrDash(value) {
  return value === undefined || value === null || value === "" ? "-" : value;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countdown(seconds) {
  for (let remaining = seconds; remaining > 0; remaining--) {
    log(`倒计时：${remaining} 秒后执行。`);
    await sleep(1000);
  }
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
