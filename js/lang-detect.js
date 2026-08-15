/* ============================================================
   Chiron Super Sport 自动语言检测 — 每次加载页面都检查访问者 IP
   - 海外 IP(非 CN)访问中文页  → 跳转英文版 en.html
   - 国内 IP 访问英文版         → 跳转中文版 index.html
   - 用户在页面上主动点过语言按钮 → 尊重用户选择,不再自动跳转
   - IP 检测失败(超时/被墙)   → 保持当前语言,不打扰
   ============================================================ */
(function () {
  if (location.protocol === 'file:') return;           // 本地预览不跳转
  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return; // 本地开发不跳转

  var onEn = /(^|\/)en\.html/i.test(location.pathname);
  var saved = null;
  try { saved = localStorage.getItem('veyron-lang'); } catch (e) {}

  // 用户显式选择过当前语言:不自动跳转
  if (saved === (onEn ? 'en' : 'zh')) return;

  function switchTo(target, lang) {
    try { localStorage.setItem('veyron-lang', lang); } catch (e) {}
    location.replace(target);
  }

  function decide(code) {
    if (!code) return;                                 // 检测失败:保持现状
    var isCN = (code === 'CN');
    if (!isCN && !onEn)      switchTo('en.html', 'en');   // 海外 → 英文版
    else if (isCN && onEn)   switchTo('index.html', 'zh'); // 国内 → 中文版
  }

  // 语言按钮点击:记录用户显式选择
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a.lang-btn');
    if (!a) return;
    var lang = /en\.html/.test(a.getAttribute('href')) ? 'en' : 'zh';
    try { localStorage.setItem('veyron-lang', lang); } catch (e) {}
  });

  // API 依次尝试:ipapi.co 主,ipinfo.io 兜底
  var tries = [
    function (cb) {
      fetch('https://ipapi.co/json/', { mode: 'cors' })
        .then(function (r) { return r.json(); })
        .then(function (d) { cb(d && d.country_code); })
        .catch(function () { cb(null); });
    },
    function (cb) {
      fetch('https://ipinfo.io/json', { mode: 'cors' })
        .then(function (r) { return r.json(); })
        .then(function (d) { cb(d && d.country); })
        .catch(function () { cb(null); });
    }
  ];
  var i = 0;
  (function next() {
    if (i >= tries.length) return;
    tries[i++](function (code) {
      if (code) decide(code);
      else next();
    });
  })();
})();
