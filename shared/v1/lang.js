/* ==========================================================================
   shared/v1/lang.js — hypercar 站点群唯一的语言分流实现
   --------------------------------------------------------------------------
   取代此前散落 17 处的 12 份 lang-detect.js 拷贝 + 4 份内联脚本。

   通过 <script> 上的 data-* 配置,行为可按站还原,无需复制代码:

     <script src="shared/v1/lang.js"
             data-strategy="ip"           ip | off        (默认 off,不检测 IP)
             data-key="veyron-lang"       localStorage 键(默认 hc-lang)
             data-zh="index.html"         中文页文件名
             data-en="en.html"            英文页文件名
             data-fallback="ipinfo"       ipinfo | ip-api | none
             data-direction="both"        both | outward
             data-persist="on"            on | off(off=完全不记忆,复现旧站行为)
             defer></script>

   行为:
     strategy=off  只记录用户在语言按钮上的显式选择,不做任何 IP 检测与跳转
     strategy=ip   按 IP 分流;非 CN 访问中文页→英文页;
                   direction=both 时 CN 访问英文页→中文页,outward 时只出不进
     - 用户显式选择过当前语言 → 不再自动跳转
     - IP 检测失败(超时/被墙)→ 保持现状,不打扰
     - file:// 与 localhost/127.0.0.1 一律不跳转(便于本地预览与自动化测试)

   与旧实现的差异(均为修复,不改变线上行为):
     1. 语言按钮的点击监听**无条件注册在一切提前 return 之前**。
        旧版把它放在后面,用户存过偏好后监听器根本不注册,点按钮不生效、
        下次加载又被弹回原语言(veyron-site 等站的现存 bug)。
     2. localStorage 键由 data-key 注入,不再靠复制文件实现差异。
     3. 兜底 API 可选,不再有的站用 ipinfo.io 有的站用 ip-api.com。
   ========================================================================== */
(function () {
  'use strict';

  var el = document.currentScript;
  if (!el) return;

  var cfg = {
    strategy:  (el.getAttribute('data-strategy')  || 'off').toLowerCase(),
    key:        el.getAttribute('data-key')       || 'hc-lang',
    zh:         el.getAttribute('data-zh')        || 'index.html',
    en:         el.getAttribute('data-en')        || 'en.html',
    fallback:  (el.getAttribute('data-fallback')  || 'ipinfo').toLowerCase(),
    direction: (el.getAttribute('data-direction') || 'both').toLowerCase(),
    // persist=off 复现"完全不记忆"的旧行为(门户与 u9x 原本没有 localStorage 键,
    // 每次加载都按 IP 判断)。迁移时这样才能做到零行为变化。
    persist:   (el.getAttribute('data-persist')   || 'on').toLowerCase() !== 'off'
  };

  var HC = window.HC = window.HC || {};

  function read() {
    if (!cfg.persist) return null;
    try { return window.localStorage.getItem(cfg.key); } catch (e) { return null; }
  }
  function save(v) {
    if (!cfg.persist) return;
    try { window.localStorage.setItem(cfg.key, v); } catch (e) {}
  }

  function isEn() {
    return new RegExp('(^|/)' + cfg.en.replace(/\./g, '\\.') + '$', 'i')
      .test(location.pathname);
  }
  function normalize(href) {
    return String(href || '').replace(/^\.\//, '').split('?')[0].split('#')[0];
  }

  var onEn = isEn();

  /* ---- 1. 语言按钮:无条件注册,必须早于任何提前 return ---- */
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest ? ev.target.closest('a') : null;
    if (!a) return;
    var href = normalize(a.getAttribute('href'));
    var isBtn = /(^|\s)lang-btn(\s|$)/.test(a.className || '');
    // 只有确属语言入口才记录:带 lang-btn 类,或 href 恰好指向两个语言页之一
    if (!isBtn && href !== cfg.en && href !== cfg.zh) return;
    save(href === cfg.en ? 'en' : (href === cfg.zh ? 'zh' : (onEn ? 'zh' : 'en')));
  });

  /* ---- 2. 对外接口 ---- */
  HC.lang = {
    key: cfg.key,
    strategy: cfg.strategy,
    direction: cfg.direction,
    current: onEn ? 'en' : 'zh',
    /** 显式切换并记住选择 */
    set: function (lang) {
      save(lang === 'en' ? 'en' : 'zh');
      location.href = (lang === 'en') ? cfg.en : cfg.zh;
    }
  };

  /* ---- 3. 本地预览与关闭策略:到此为止 ---- */
  if (location.protocol === 'file:') return;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname)) return;
  if (cfg.strategy !== 'ip') return;

  /* ---- 4. 用户显式选择过当前语言:尊重,不跳转 ---- */
  if (read() === (onEn ? 'en' : 'zh')) return;

  function go(target, lang) {
    save(lang);
    location.replace(target);
  }

  function decide(code) {
    if (!code) return;                        // 检测失败:保持现状
    var isCN = (code === 'CN');
    if (!isCN && !onEn) {
      if (cfg.direction === 'both' || cfg.direction === 'outward') go(cfg.en, 'en');
    } else if (isCN && onEn) {
      if (cfg.direction === 'both') go(cfg.zh, 'zh');
    }
  }

  /* ---- 5. 依次尝试的 IP 接口:ipapi.co 主,data-fallback 兜底 ---- */
  var FALLBACKS = {
    ipinfo: function (cb) {
      fetch('https://ipinfo.io/json', { mode: 'cors' })
        .then(function (r) { return r.json(); })
        .then(function (d) { cb(d && d.country); })
        .catch(function () { cb(null); });
    },
    'ip-api': function (cb) {
      fetch('https://ip-api.com/json/?fields=countryCode', { mode: 'cors' })
        .then(function (r) { return r.json(); })
        .then(function (d) { cb(d && d.countryCode); })
        .catch(function () { cb(null); });
    }
  };

  var tries = [function (cb) {
    fetch('https://ipapi.co/json/', { mode: 'cors' })
      .then(function (r) { return r.json(); })
      .then(function (d) { cb(d && d.country_code); })
      .catch(function () { cb(null); });
  }];
  if (FALLBACKS[cfg.fallback]) tries.push(FALLBACKS[cfg.fallback]);

  var i = 0;
  (function next() {
    if (i >= tries.length) return;
    tries[i++](function (code) {
      if (code) decide(code);
      else next();
    });
  })();
})();
