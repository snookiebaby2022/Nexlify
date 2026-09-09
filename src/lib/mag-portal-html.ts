/** Ministra / XUI-style MAG portal shell — paginated API, remote-friendly navigation. */
export function magPortalClientHtml(): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IPTV Portal</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;touch-action:manipulation}
html{background:#071222}
body{font-family:Segoe UI,Arial,sans-serif;background:#071222;color:#e8eef9;-webkit-tap-highlight-color:transparent}
#app{display:flex;flex-direction:column;height:100vh}
header{background:linear-gradient(180deg,#1a4a8a,#12325c);padding:.7rem 1rem;border-bottom:1px solid #2a5a9a}
header h1{font-size:1rem;font-weight:600}
header .sub{font-size:.72rem;opacity:.75;margin-top:.15rem}
header .path{font-size:.72rem;color:#9ec7ff;margin-top:.25rem}
#browse-context{display:none;padding:.55rem .85rem;background:linear-gradient(90deg,#0f2848,#132f55);border-bottom:2px solid #3d8fd4;font-size:.82rem;line-height:1.35}
#browse-context.visible{display:block}
#browse-context .ctx-module{color:#7eb8ff;font-weight:600;text-transform:uppercase;font-size:.68rem;letter-spacing:.04em}
#browse-context .ctx-line{margin-top:.2rem;font-size:.95rem;font-weight:600;color:#fff}
#browse-context .ctx-line .ctx-cat{color:#ffd27a}
#browse-context .ctx-line .ctx-sep{opacity:.55;margin:0 .35rem}
#browse-context .ctx-line .ctx-item{color:#e8f4ff}
main{flex:1;min-height:0;position:relative}
.screen{display:none;height:100%}
.screen.active{display:flex;flex-direction:column}
.menu-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:1rem}
.menu{width:min(420px,92vw)}
.menu .item{display:flex;align-items:center;gap:1rem;padding:1rem 1.1rem;margin-bottom:.55rem;border:2px solid #1e3a5f;border-radius:10px;background:#0d1f38;font-size:1.05rem;color:#cfe3ff}
.menu .item.focused{border-color:#5eb3ff;background:#1a4a8a;color:#fff;box-shadow:0 0 0 2px rgba(94,179,255,.45)}
.menu .item .icon{width:2rem;text-align:center;font-size:1.2rem}
.browse{flex:1;display:flex;min-height:0}
.pane{background:#0a1628;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.pane-cats{width:36%;max-width:300px;border-right:1px solid #1e3a5f;flex-shrink:0}
.pane-items{flex:1}
.row{display:flex;align-items:center;gap:.75rem;padding:.78rem 1rem;border-bottom:1px solid #152a45;font-size:.95rem;min-height:2.6rem}
.row.focused{background:#1a4a8a;color:#fff;outline:2px solid #5eb3ff;outline-offset:-2px}
.row .num{width:2rem;color:#7eb8ff;text-align:right;flex-shrink:0}
.row .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hint{padding:.45rem .75rem;font-size:.68rem;color:#6a8ab5;background:#071222;border-top:1px solid #152a45}
.status{padding:2rem;text-align:center;color:#9fb6d9}
.err{color:#ff8a8a;padding:1.2rem}
#playback-ui{display:none;position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:.85rem 1rem;background:linear-gradient(180deg,rgba(7,18,34,.78),rgba(7,18,34,.96));border-top:3px solid #5eb3ff;align-items:center;gap:1rem;box-shadow:0 -8px 28px rgba(0,0,0,.55)}
#playback-ui.active{display:flex}
.pb-btn{padding:.65rem 1.1rem;border:2px solid #fff;border-radius:8px;background:#1a4a8a;color:#fff;font-size:.95rem;font-weight:600;cursor:pointer;flex-shrink:0}
.pb-btn.focused{box-shadow:0 0 0 3px rgba(94,179,255,.65);background:#2563b8}
.pb-meta{flex:1;min-width:0}
.pb-category{font-size:.78rem;font-weight:700;color:#ffd27a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.15rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pb-stream{font-size:1.15rem;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,.6)}
.pb-hint{font-size:.68rem;color:#9ec7ff;margin-top:.2rem;opacity:.9}
#volume-hud{display:none;position:fixed;top:1rem;right:1rem;z-index:2147483647;padding:.55rem .85rem;border-radius:10px;background:rgba(7,18,34,.92);border:2px solid #5eb3ff;color:#fff;font-size:1rem;font-weight:700;min-width:5rem;text-align:center}
#volume-hud.active{display:block}
html.mag-playing,body.mag-playing{background:transparent!important}
html.mag-playing.html5-play,body.mag-playing.html5-play{background:#000!important}
body.mag-playing #app{opacity:0;pointer-events:none}
body.mag-playing #playback-ui{pointer-events:auto;opacity:1!important}
#html5player{display:none;position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:1}
body.mag-playing #html5player{display:block}
#html5player::-webkit-media-controls,
#html5player::-webkit-media-controls-start-playback-button,
#html5player::-webkit-media-controls-overlay-play-button{display:none!important;opacity:0;pointer-events:none}
</style>
</head>
<body>
<div id="app">
  <header>
    <h1 id="title">Nexlify IPTV</h1>
    <div class="sub" id="profile">Loading…</div>
    <div class="path" id="crumb">Main menu</div>
  </header>
  <div id="browse-context">
    <div class="ctx-module" id="ctx-module">Live TV</div>
    <div class="ctx-line">
      <span class="ctx-cat" id="ctx-category">Category</span>
      <span class="ctx-sep">›</span>
      <span class="ctx-item" id="ctx-item">Channel</span>
    </div>
  </div>
  <main>
    <div id="screen-menu" class="screen active">
      <div class="menu-wrap"><div class="menu" id="main-menu"></div></div>
      <div class="hint">↑↓ move · OK open · BACK menu</div>
    </div>
    <div id="screen-browse" class="screen">
      <div class="browse">
        <div class="pane pane-cats" id="cats"></div>
        <div class="pane pane-items" id="items"></div>
      </div>
      <div class="hint" id="browse-hint">←→ panes · ↑↓ select · OK play · CH+/− page · BACK back</div>
    </div>
    <div id="screen-loading" class="screen"><div class="status" id="loading-msg">Loading…</div></div>
    <div id="screen-error" class="screen"><div class="err" id="error-msg"></div></div>
  </main>
  <footer id="mac-line">Nexlify MAG Portal</footer>
</div>
<div id="playback-ui">
  <button type="button" id="btn-playback-back" class="pb-btn">◀ Back</button>
  <button type="button" id="btn-vol-down" class="pb-btn">Vol −</button>
  <button type="button" id="btn-vol-up" class="pb-btn">Vol +</button>
  <div class="pb-meta">
    <div class="pb-category" id="playback-category">Live TV</div>
    <div class="pb-stream" id="playback-title">Now playing</div>
      <div class="pb-hint">CH+/− next channel · BACK returns to list · Vol ± if hardware keys fail</div>
  </div>
</div>
<div id="volume-hud">Vol 50</div>
<script type="text/javascript">
(function () {
  var API = "/c/";
  var PAGE = 14;
  var mac = "", token = "", profile = null;
  var screen = "menu", pane = "menu";
  var idxMenu = 0, idxCat = 0, idxItem = 0;
  var curPage = 0, totalItems = 0;
  var module = null, moduleLabel = "";
  var categories = [], items = [], seriesPick = null;
  var loading = false, lastKey = 0, lastKeyAt = 0, navigationSeq = 0;
  var playing = false, playbackTitle = "", playbackCategory = "";
  var nativePlayerActive = false;
  var resumeBrowse = null;
  var activeStreamId = null;
  var suppressPlayerStop = false;
  var volumeHudTimer = null;
  var portalVolume = 50;
  var playSeq = 0;
  var lastDiagnostic = "";
  var lastDiagnosticAt = 0;
  var html5Playback = false;
  var html5TsPlayer = null;
  var html5Hls = null;

  var MODULES = [
    { id: "tv", label: "Live TV", icon: "📺", apiType: "stb" },
    { id: "vod", label: "Video Club", icon: "🎬", apiType: "vod" },
    { id: "series", label: "Series", icon: "📚", apiType: "series" }
  ];

  function esc(s) {
    return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
  }

  function normalizeMac(raw) {
    if (!raw) return "";
    var hex = String(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    if (hex.length !== 12) return String(raw);
    return hex.match(/.{2}/g).join(":");
  }

  function deviceMac() {
    var fromUrl = new URLSearchParams(window.location.search).get("mac");
    if (fromUrl) return normalizeMac(fromUrl);
    var m = document.cookie.match(/(?:^|;\\s*)mac=([^;]+)/i);
    return m ? normalizeMac(decodeURIComponent(m[1])) : "";
  }

  // StbEmu Pro does not consistently expose its configured MAC as a cookie or
  // request header. These getters are deliberately isolated from all native
  // player/window APIs: calling those during boot can replace the WebView with
  // a transparent/black native surface.
  function nativeDeviceMac() {
    var roots = [];
    try { if (window.stb) roots.push(window.stb); } catch (_) {}
    try { if (window.gSTB) roots.push(window.gSTB); } catch (_) {}
    try { if (window.STB) roots.push(window.STB); } catch (_) {}
    var getters = [
      "GetDeviceMacAddress", "GetMacAddress", "GetMACAddress", "GetMac",
      "getDeviceMacAddress", "getMacAddress", "getMac"
    ];
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i];
      if (!root) continue;
      for (var j = 0; j < getters.length; j++) {
        try {
          var getter = root[getters[j]];
          if (typeof getter !== "function") continue;
          var value = normalizeMac(getter.call(root));
          if (/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(value)) return value;
        } catch (_) {
          // A missing or restricted native getter must not prevent portal UI.
        }
      }
    }
    return "";
  }

  function apiUrl(action, apiType, extra) {
    var qs = new URLSearchParams({ type: apiType || "stb", action: action, JsHttpRequest: "1-xml" });
    if (mac) qs.set("mac", mac);
    if (token) qs.set("token", token);
    if (extra) Object.keys(extra).forEach(function (k) {
      if (extra[k] != null && extra[k] !== "") qs.set(k, String(extra[k]));
    });
    return API + "?" + qs.toString();
  }

  function api(action, apiType, extra) {
    return fetch(apiUrl(action, apiType, extra), {
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (payload) {
      if (payload && payload.js && payload.js.error && payload.js.authorized === 0) {
        throw new Error(String(payload.js.error));
      }
      return payload;
    });
  }

  // This is deliberately a normal Stalker request (and contains no credentials).
  // It lets the panel distinguish an absent remote event from a portal/API failure.
  function reportDeviceEvent(event, code) {
    if (!mac) return;
    var signature = String(event || "") + ":" + String(code || "");
    var now = Date.now();
    if (signature === lastDiagnostic && now - lastDiagnosticAt < 750) return;
    lastDiagnostic = signature;
    lastDiagnosticAt = now;
    api("client_event", "stb", { event: event, code: code || "" }).catch(function () {});
  }

  function setScreen(name) {
    screen = name;
    var nodes = document.querySelectorAll(".screen");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle("active", nodes[i].id === "screen-" + name);
    }
  }

  function setCrumb(text) { document.getElementById("crumb").textContent = text; }

  function showError(msg) {
    navigationSeq++;
    playSeq++;
    loading = false;
    // Force opaque portal UI — never leave mag-playing / SetTransparent(true) stuck.
    if (playing) {
      var closingStream = activeStreamId;
      playing = false;
      loading = false;
      resumeBrowse = null;
      activeStreamId = null;
      suppressPlayerStop = true;
      stopNativePlayer();
      suppressPlayerStop = false;
      if (closingStream) notifyDisconnect(closingStream);
      document.getElementById("playback-ui").classList.remove("active");
    }
    showPortalUi();
    document.getElementById("error-msg").textContent = msg;
    setScreen("error");
  }

  function rowsIn(el) { return el ? el.querySelectorAll(".row, .item") : []; }

  function focusRows(container, index) {
    if (!container) return;
    var rows = rowsIn(container);
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle("focused", i === index);
    if (rows[index] && rows[index].scrollIntoView) {
      rows[index].scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }

  function setBrowseContextVisible(on) {
    document.getElementById("browse-context").classList.toggle("visible", !!on);
  }

  function captureBrowseState() {
    var cat = categories[idxCat];
    var item = items[idxItem];
    return {
      idxCat: idxCat,
      idxItem: idxItem,
      curPage: curPage,
      pane: pane,
      seriesPick: seriesPick,
      catId: cat ? String(cat.id) : "",
      catName: cat ? (cat.title || cat.name || "") : "",
      itemId: item ? String(item.id) : "",
      itemName: item ? (item.name || "") : ""
    };
  }

  function applyBrowseSnapshot(saved) {
    if (!saved) return;
    seriesPick = saved.seriesPick || null;
    curPage = saved.curPage != null ? saved.curPage : 0;
    pane = saved.pane || "items";
    if (saved.catId && categories.length) {
      for (var i = 0; i < categories.length; i++) {
        if (String(categories[i].id) === String(saved.catId)) {
          idxCat = i;
          break;
        }
      }
    } else if (saved.idxCat != null && categories.length) {
      idxCat = Math.min(Math.max(0, saved.idxCat), categories.length - 1);
    }
  }

  function restoreItemFocus(saved) {
    if (!saved || !items.length) return;
    if (saved.itemId) {
      for (var i = 0; i < items.length; i++) {
        if (String(items[i].id) === String(saved.itemId)) {
          idxItem = i;
          return;
        }
      }
    }
    if (saved.itemName) {
      for (var j = 0; j < items.length; j++) {
        if (items[j].name === saved.itemName) {
          idxItem = j;
          return;
        }
      }
    }
    if (saved.idxItem != null) {
      idxItem = Math.min(Math.max(0, saved.idxItem), items.length - 1);
    }
  }

  function updateBrowseContextBar() {
    var ctx = document.getElementById("browse-context");
    if (!ctx || screen !== "browse" || !module) {
      setBrowseContextVisible(false);
      return;
    }
    setBrowseContextVisible(true);
    document.getElementById("ctx-module").textContent = moduleLabel || "Browse";
    var cat = categories[idxCat];
    var catName = cat ? (cat.title || cat.name || "Category") : "Category";
    document.getElementById("ctx-category").textContent = catName;
    var item = items[idxItem];
    document.getElementById("ctx-item").textContent = item ? item.name : "Select a channel";
  }

  function updatePlaybackBar(title, categoryName) {
    document.getElementById("playback-category").textContent = categoryName || moduleLabel || "Live TV";
    document.getElementById("playback-title").textContent = title || "Now playing";
  }

  function pageInfo() {
    var pages = Math.max(1, Math.ceil(totalItems / PAGE));
    return "Page " + (curPage + 1) + "/" + pages + " · " + totalItems + " items";
  }

  function renderMainMenu() {
    navigationSeq++;
    playSeq++;
    loading = false;
    pane = "menu";
    idxMenu = 0;
    module = null;
    seriesPick = null;
    curPage = 0;
    setCrumb("Main menu");
    document.getElementById("title").textContent = "Nexlify IPTV";
    var box = document.getElementById("main-menu");
    box.innerHTML = MODULES.map(function (m, i) {
      return '<div class="item" data-i="' + i + '"><span class="icon">' + m.icon + '</span><span>' + esc(m.label) + '</span></div>';
    }).join("");
    var nodes = rowsIn(box);
    for (var i = 0; i < nodes.length; i++) {
      (function (el, n) {
        bindActivate(el, function () { idxMenu = n; openModule(); });
      })(nodes[i], i);
    }
    setScreen("menu");
    setBrowseContextVisible(false);
    focusRows(box, idxMenu);
  }

  function renderCats() {
    var box = document.getElementById("cats");
    box.innerHTML = categories.map(function (c, i) {
      return '<div class="row" data-i="' + i + '" data-id="' + esc(c.id) + '"><span class="name">' + esc(c.title || c.name) + '</span></div>';
    }).join("");
    var nodes = rowsIn(box);
    for (var i = 0; i < nodes.length; i++) {
      (function (el, n) {
        bindActivate(el, function () {
          idxCat = n;
          pane = "cats";
          curPage = 0;
          idxItem = 0;
          setCrumb(browseCrumb());
          loadItems(el.getAttribute("data-id"));
        });
      })(nodes[i], i);
    }
    focusRows(box, idxCat);
    updateBrowseContextBar();
  }

  function renderItems() {
    var box = document.getElementById("items");
    document.getElementById("browse-hint").textContent = pageInfo() + " · ←→ panes · ↑↓ select · OK play · BACK back";
    if (!items.length) {
      box.innerHTML = '<div class="status">No items in this category</div>';
      return;
    }
    box.innerHTML = items.map(function (it, i) {
      return '<div class="row" data-i="' + i + '" data-cmd="' + esc(it.cmd) + '" data-series="' + (it.is_series ? "1" : "0") + '" data-id="' + esc(it.id) + '">' +
        '<span class="num">' + esc(it.number || (curPage * PAGE + i + 1)) + '</span>' +
        '<span class="name">' + esc(it.name) + '</span></div>';
    }).join("");
    var nodes = rowsIn(box);
    for (var i = 0; i < nodes.length; i++) {
      (function (el, n) {
        bindActivate(el, function () { idxItem = n; pane = "items"; activateItem(el); });
      })(nodes[i], i);
    }
    if (idxItem >= nodes.length) idxItem = Math.max(0, nodes.length - 1);
    focusRows(box, idxItem);
    updateBrowseContextBar();
  }

  function loadItemsForced(catId, page) {
    if (page == null) page = curPage;
    curPage = page;
    pane = "items";
    document.getElementById("items").innerHTML = '<div class="status">Loading…</div>';
    var extra = { genre: catId, category: catId, p: String(curPage) };
    if (seriesPick) extra.movie_id = seriesPick;
    return api("get_ordered_list", module.apiType, extra).then(function (r) {
      items = (r.js && r.js.data) || [];
      totalItems = (r.js && r.js.total_items) || items.length;
      renderItems();
      focusRows(document.getElementById("cats"), idxCat);
      updateBrowseContextBar();
    });
  }

  function loadItems(catId, page) {
    if (loading) return;
    loading = true;
    var seq = ++navigationSeq;
    loadItemsForced(catId, page).then(function () {
      if (seq !== navigationSeq) return;
      loading = false;
    }).catch(function (e) {
      if (seq !== navigationSeq) return;
      loading = false;
      showError(e.message || "Failed to load list");
    });
  }

  function openBrowse() {
    var seq = ++navigationSeq;
    pane = "cats";
    idxCat = 0;
    idxItem = 0;
    curPage = 0;
    setScreen("loading");
    document.getElementById("loading-msg").textContent = "Loading " + moduleLabel + "…";
    api("get_categories", module.apiType).then(function (r) {
      if (seq !== navigationSeq) return;
      categories = Array.isArray(r.js) ? r.js : [];
      if (!categories.length) categories = [{ id: "0", title: moduleLabel }];
      renderCats();
      setScreen("browse");
      setCrumb("Main menu · " + moduleLabel);
      focusRows(document.getElementById("cats"), idxCat);
      updateBrowseContextBar();
      loadItems(categories[0].id, 0);
    }).catch(function (e) {
      if (seq === navigationSeq) showError(e.message || "Failed to load categories");
    });
  }

  function openModule() {
    module = MODULES[idxMenu];
    moduleLabel = module.label;
    seriesPick = null;
    document.getElementById("title").textContent = moduleLabel;
    openBrowse();
  }

  function bindActivate(el, action) {
    el.onclick = function () {
      reportDeviceEvent("pointer_activate");
      action();
    };
    el.ontouchend = function (ev) {
      if (ev) ev.preventDefault();
      reportDeviceEvent("touch_activate");
      action();
      return false;
    };
  }

  function streamIdFromCmd(cmd) {
    return String(cmd || "").replace(/^ffmpeg\\s+/i, "").replace(/^series:/i, "").trim();
  }

  function isBackKey(code, key) {
    code = parseInt(code, 10) || 0;
    key = String(key || "");
    return code === 8 || code === 4 || code === 27 || code === 166 || code === 461 ||
      code === 10009 || code === 88 || code === 501 || code === 283 || code === 112 ||
      code === 36 || code === 18 || code === 123 || code === 61448 ||
      key === "Backspace" || key === "Escape" || key === "Back" || key === "BrowserBack" ||
      key === "Exit" || key === "GoBack";
  }

  function isEnterKey(code, key) {
    code = parseInt(code, 10) || 0;
    return code === 13 || code === 23 || code === 66 || code === 160 ||
      key === "Enter" || key === "Select" || key === "OK" || key === "DpadCenter";
  }

  function isChUp(code) {
    code = parseInt(code, 10) || 0;
    return code === 427 || code === 33 || code === 437 || code === 117;
  }

  function isChDown(code) {
    code = parseInt(code, 10) || 0;
    return code === 428 || code === 34 || code === 438 || code === 118;
  }

  function isVolumeKey(code, key) {
    return code === 107 || code === 108 || code === 447 || code === 448 ||
      code === 175 || code === 174 || code === 24 || code === 25 ||
      code === 241 || code === 242 || code === 573 || code === 574 ||
      key === "VolumeUp" || key === "VolumeDown";
  }

  function isVolumeUp(code, key) {
    return code === 107 || code === 447 || code === 175 || code === 24 ||
      code === 241 || code === 573 || key === "VolumeUp";
  }

  function showVolumeHud(level) {
    var hud = document.getElementById("volume-hud");
    if (!hud) return;
    hud.textContent = "Vol " + level;
    hud.classList.add("active");
    if (volumeHudTimer) clearTimeout(volumeHudTimer);
    volumeHudTimer = setTimeout(function () { hud.classList.remove("active"); }, 1400);
  }

  function readVolumeLevel() {
    if (!nativePlayerActive) return portalVolume;
    return stbCall(function () {
      if (typeof stb !== "undefined" && stb.player && typeof stb.player.GetVolume === "function") {
        return stb.player.GetVolume();
      }
      if (typeof stb !== "undefined" && typeof stb.GetVolume === "function") return stb.GetVolume();
      if (typeof stb !== "undefined" && typeof stb.GetAudioVolume === "function") return stb.GetAudioVolume();
      return portalVolume;
    }) ?? portalVolume;
  }

  function nativeVolumeStep(up) {
    if (!nativePlayerActive) return false;
    return stbCall(function () {
      if (typeof window.AndroidInterface !== "undefined") {
        if (up && typeof window.AndroidInterface.volumeUp === "function") {
          window.AndroidInterface.volumeUp();
          return true;
        }
        if (!up && typeof window.AndroidInterface.volumeDown === "function") {
          window.AndroidInterface.volumeDown();
          return true;
        }
      }
      if (typeof window.stbemu !== "undefined") {
        if (up && typeof window.stbemu.volumeUp === "function") {
          window.stbemu.volumeUp();
          return true;
        }
        if (!up && typeof window.stbemu.volumeDown === "function") {
          window.stbemu.volumeDown();
          return true;
        }
      }
      if (typeof stb !== "undefined" && stb.player) {
        var cur = typeof stb.player.GetVolume === "function" ? stb.player.GetVolume() : portalVolume;
        if (typeof cur !== "number" || isNaN(cur)) cur = portalVolume;
        var step = 5;
        var next = up ? Math.min(100, cur + step) : Math.max(0, cur - step);
        if (typeof stb.player.SetVolume === "function") {
          stb.player.SetVolume(next);
          return true;
        }
      }
      if (typeof stb !== "undefined" && typeof stb.SetVolume === "function") {
        var cur2 = typeof stb.GetVolume === "function" ? stb.GetVolume() : portalVolume;
        if (typeof cur2 !== "number" || isNaN(cur2)) cur2 = portalVolume;
        var next2 = up ? Math.min(100, cur2 + 5) : Math.max(0, cur2 - 5);
        stb.SetVolume(next2);
        return true;
      }
      return false;
    }) === true;
  }

  function writeVolumeLevel(level) {
    portalVolume = level;
    showVolumeHud(level);
    applyHtml5Volume();
    if (!nativePlayerActive) return false;
    return stbCall(function () {
      if (typeof stb !== "undefined" && stb.player && typeof stb.player.SetVolume === "function") {
        stb.player.SetVolume(level);
        return true;
      }
      if (typeof stb !== "undefined" && typeof stb.SetVolume === "function") {
        stb.SetVolume(level);
        return true;
      }
      if (typeof stb !== "undefined" && typeof stb.SetAudioVolume === "function") {
        stb.SetAudioVolume(level);
        return true;
      }
      return false;
    }) === true;
  }

  function adjustVolume(code, key) {
    var up = isVolumeUp(code, key);
    var down = isVolumeKey(code, key) && !up;
    if (!up && !down) return false;
    if (nativeVolumeStep(up)) {
      var cur = readVolumeLevel();
      if (typeof cur === "number" && !isNaN(cur)) portalVolume = cur;
      else portalVolume = up ? Math.min(100, portalVolume + 5) : Math.max(0, portalVolume - 5);
      showVolumeHud(portalVolume);
      return true;
    }
    var cur2 = readVolumeLevel();
    if (typeof cur2 !== "number" || isNaN(cur2)) cur2 = portalVolume;
    var step = 5;
    var next = up ? Math.min(100, cur2 + step) : Math.max(0, cur2 - step);
    writeVolumeLevel(next);
    return true;
  }

  // These APIs are unsafe in StbEmu Pro unless a user has explicitly started
  // playback. Keep this function out of boot and all DOM-only restore paths.
  function keepRemoteInPortal() {
    // Browser window stays on top so Back/volume remain visible; video shows
    // through the transparent WebView (SetTransparent + mag-playing CSS).
    setTopWindow(0);
  }

  function setTopWindow(winNum) {
    stbCall(function () {
      if (typeof stb !== "undefined") {
        if (stb.SetTopWin) stb.SetTopWin(winNum);
        if (stb.EnableAppButton) stb.EnableAppButton(true);
        if (stb.EnableServiceButton) stb.EnableServiceButton(true);
      }
      if (typeof gSTB !== "undefined") {
        if (gSTB.SetTopWin) gSTB.SetTopWin(winNum);
        if (gSTB.EnableAppButton) gSTB.EnableAppButton(true);
        if (gSTB.EnableServiceButton) gSTB.EnableServiceButton(true);
      }
    });
  }

  function setPlayerLayerTransparent(on) {
    stbCall(function () {
      if (typeof stb !== "undefined" && stb.SetTransparent) stb.SetTransparent(!!on);
      if (typeof gSTB !== "undefined" && gSTB.SetTransparent) gSTB.SetTransparent(!!on);
    });
  }

  function hidePortalUi() {
    document.documentElement.classList.add("mag-playing");
    document.body.classList.add("mag-playing");
    if (html5Playback) {
      document.documentElement.classList.add("html5-play");
      document.body.classList.add("html5-play");
      return;
    }
    setPlayerLayerTransparent(true);
    keepRemoteInPortal();
  }

  function showPortalUi() {
    document.documentElement.classList.remove("mag-playing", "html5-play");
    document.body.classList.remove("mag-playing", "html5-play");
    document.body.style.background = "";
    document.documentElement.style.background = "";
  }

  function notifyDisconnect(streamId) {
    if (!streamId) return;
    api("stop_link", "stb", { cmd: "ffmpeg " + streamId }).catch(function () {});
  }

  function playerSolution(url) {
    var u = String(url || "").toLowerCase();
    if (u.indexOf(".m3u8") >= 0 || u.indexOf("/hls/") >= 0) return "auto";
    if (u.indexOf(".mp4") >= 0 || u.indexOf(".mkv") >= 0 || u.indexOf(".avi") >= 0) return "ffmpeg";
    // MAG/StbEmu HTTP MPEG-TS uses the ffmpeg solution, matching create_link.
    return "ffmpeg";
  }

  function stbCall(fn) {
    try { return fn(); } catch (e) { return null; }
  }

  function stopNativePlayer() {
    stopHtml5();
    if (!nativePlayerActive) return;
    stbCall(function () {
      if (typeof stb !== "undefined") {
        if (stb.player && stb.player.stop) stb.player.stop();
        else if (stb.Stop) stb.Stop();
      }
      if (typeof gSTB !== "undefined" && gSTB.Stop) gSTB.Stop();
    });
    nativePlayerActive = false;
  }

  function zapChannel(delta) {
    if (!playing || !module || !items.length) return;
    var pages = Math.max(1, Math.ceil(totalItems / PAGE));
    var catId = categories[idxCat] ? categories[idxCat].id : "0";
    var next = idxItem + delta;
    function playAt(i) {
      idxItem = i;
      var it = items[idxItem];
      if (it && it.cmd) playCmd(it.cmd);
    }
    if (next >= 0 && next < items.length) {
      playAt(next);
      return;
    }
    if (delta > 0) {
      if (curPage < pages - 1) {
        loadItemsForced(catId, curPage + 1).then(function () { playAt(0); }).catch(function () {});
        return;
      }
      if (pages > 1) {
        loadItemsForced(catId, 0).then(function () { playAt(0); }).catch(function () {});
        return;
      }
      playAt(0);
      return;
    }
    if (curPage > 0) {
      loadItemsForced(catId, curPage - 1).then(function () {
        playAt(Math.max(0, items.length - 1));
      }).catch(function () {});
      return;
    }
    if (pages > 1) {
      loadItemsForced(catId, pages - 1).then(function () {
        playAt(Math.max(0, items.length - 1));
      }).catch(function () {});
      return;
    }
    playAt(Math.max(0, items.length - 1));
  }

  function handlePlaybackRemote(code, keyStr) {
    code = parseInt(code, 10) || 0;
    keyStr = String(keyStr || "");
    if (isVolumeKey(code, keyStr)) {
      adjustVolume(code, keyStr);
      return true;
    }
    if (isBackKey(code, keyStr)) {
      exitPlayback(true);
      return true;
    }
    if (isChUp(code) || (module && module.id === "tv" && code === 38)) {
      zapChannel(-1);
      return true;
    }
    if (isChDown(code) || (module && module.id === "tv" && code === 40)) {
      zapChannel(1);
      return true;
    }
    if (code === 13 || isEnterKey(code, keyStr)) {
      var hv = document.getElementById("html5player");
      if (html5Playback && hv && hv.paused) {
        kickHtml5Play();
        return true;
      }
      exitPlayback(true);
      return true;
    }
    return false;
  }

  function bindStbEvents() {
    window.stbEvent = window.stbEvent || {};
    var prev = window.stbEvent.onEvent;
    window.stbEvent.onEvent = function (event, info) {
      try {
        var evStr = String(event == null ? "" : event);
        var evLower = evStr.toLowerCase();
        var eventNum = parseInt(evStr, 10);
        var infoNum = parseInt(info, 10);
        var keyCode = !isNaN(infoNum) && String(info).length ? infoNum : eventNum;

        if (playing) {
          if (eventNum === 2 || eventNum === 4 ||
              evLower.indexOf("play_end") >= 0 || evLower === "stop" ||
              evLower === "player_stop" || evLower === "end") {
            exitPlayback(eventNum === 4);
            return false;
          }
          if (eventNum !== 1 && eventNum !== 5 && handlePlaybackRemote(keyCode, String(info || event || ""))) {
            return false;
          }
          if (evLower.indexOf("key") >= 0 || evLower === "keyboard") {
            if (handlePlaybackRemote(keyCode, String(info || ""))) return false;
          }
        }
        if (evLower.indexOf("key") >= 0 || evLower === "keyboard" || (!isNaN(keyCode) && keyCode > 0)) {
          if (routeRemoteKey(keyCode, String(info || event || ""))) return false;
        }
      } catch (e) {}
      if (typeof prev === "function") return prev(event, info);
    };
    window.stbEvent.onBroadcastMessage = window.stbEvent.onBroadcastMessage || function () {};
    window.stbEvent.onPress = function (code) {
      return routeRemoteKey(code, "");
    };
    window.stbEvent.onKeyPress = function (code) {
      return routeRemoteKey(code, "");
    };

    // Some remotes send key codes via window keydown, but on mobile/emulators
    // document or window might need explicit listener on both.
    document.addEventListener("keydown", function(ev) {
      if (playing) {
        var c = ev.keyCode || ev.which || 0;
        var k = ev.key || "";
        if (isBackKey(c, k) || c === 13) {
          ev.preventDefault();
          exitPlayback(true);
        }
      }
    }, true);
    // StbEmu variants expose either a JavaScript bridge event object or the
    // legacy global callback. Register only input callbacks at boot: player,
    // window, and transparency APIs remain explicit-playback-only.
    stbCall(function () {
      var roots = [];
      if (typeof stb !== "undefined") roots.push(stb);
      if (typeof gSTB !== "undefined") roots.push(gSTB);
      for (var i = 0; i < roots.length; i++) {
        var events = roots[i] && (roots[i].event || roots[i].Event);
        if (!events) continue;
        var prior = events.onEvent;
        events.onEvent = function (event, info) {
          var keyCode = parseInt(info, 10);
          if (isNaN(keyCode)) keyCode = parseInt(event, 10) || 0;
          if (routeRemoteKey(keyCode, String(info || event || ""))) return false;
          if (typeof prior === "function") return prior(event, info);
        };
        events.onKeyPress = function (code) { return routeRemoteKey(code, ""); };
      }
    });
  }

  function routeRemoteKey(code, key) {
    code = parseInt(code, 10) || 0;
    if (!code && !key) return false;
    reportDeviceEvent("bridge_key", code);
    if (playing) return handlePlaybackRemote(code, key);
    onKey({
      keyCode: code,
      which: code,
      key: key || "",
      preventDefault: function () {},
      stopPropagation: function () {},
      stopImmediatePropagation: function () {}
    });
    return true;
  }

  function bindPlayerCallbacks() {
    stbCall(function () {
      if (typeof stb === "undefined" || !stb.player) return;
      stb.player.onPlay = function () {};
      stb.player.onPlayCallBack = function () {};
      stb.player.onStop = function () {
        if (suppressPlayerStop || !playing) return;
        exitPlayback(true);
      };
      stb.player.onStopCallBack = function () {
        if (suppressPlayerStop || !playing) return;
        exitPlayback(true);
      };
      stb.player.onPlayEnd = function () {
        if (suppressPlayerStop || !playing) return;
        exitPlayback(true);
      };
      stb.player.onError = function () {
        if (suppressPlayerStop || !playing) return;
        exitPlayback(true);
        showError("Native player rejected the stream");
      };
    });
  }

  function bindPlaybackUi() {
    var back = document.getElementById("btn-playback-back");
    if (back) {
      bindActivate(back, function () { exitPlayback(true); });
      back.addEventListener("click", function(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        exitPlayback(true);
      });
      back.addEventListener("touchend", function(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        exitPlayback(true);
      });
    }
    var volUp = document.getElementById("btn-vol-up");
    var volDown = document.getElementById("btn-vol-down");
    function bindVol(btn, up) {
      if (!btn) return;
      btn.onclick = function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        adjustVolume(up ? 107 : 108, up ? "VolumeUp" : "VolumeDown");
      };
      btn.ontouchstart = function (ev) {
        ev.preventDefault();
        adjustVolume(up ? 107 : 108, up ? "VolumeUp" : "VolumeDown");
      };
    }
    bindVol(volUp, true);
    bindVol(volDown, false);
  }

  function finishBrowseRestore(snapshot) {
    applyBrowseSnapshot(snapshot);
    document.getElementById("title").textContent = moduleLabel;
    setScreen("browse");
    renderCats();
    setCrumb(browseCrumb());
    updateBrowseContextBar();
    var catId = snapshot.catId || (categories[idxCat] && categories[idxCat].id) || categories[0].id;
    return loadItemsForced(String(catId), snapshot.curPage || 0).then(function () {
      restoreItemFocus(snapshot);
      renderItems();
      pane = snapshot.pane || "items";
      focusRows(document.getElementById("cats"), idxCat);
      focusRows(document.getElementById("items"), idxItem);
      setCrumb(browseCrumb());
      updateBrowseContextBar();
    });
  }

  function restoreBrowseAfterPlayback(snapshot) {
    if (!module) {
      renderMainMenu();
      return;
    }
    if (!snapshot) snapshot = captureBrowseState();

    if (categories.length > 0) {
      finishBrowseRestore(snapshot).catch(function (e) {
        showError(e.message || "Failed to restore browse");
      });
      return;
    }

    loading = true;
    setScreen("loading");
    document.getElementById("loading-msg").textContent = "Loading " + moduleLabel + "…";
    api("get_categories", module.apiType).then(function (r) {
      categories = Array.isArray(r.js) ? r.js : [];
      if (!categories.length) categories = [{ id: "0", title: moduleLabel }];
      return finishBrowseRestore(snapshot);
    }).catch(function (e) {
      showError(e.message || "Failed to reload categories");
    }).then(function () { loading = false; });
  }

  function browseCrumb() {
    var cat = categories[idxCat];
    var catName = cat ? (cat.title || cat.name || "") : "";
    if (seriesPick && module && module.id === "series") {
      var show = items[idxItem] && items[idxItem].name;
      return "Main menu · Series · " + (show || catName);
    }
    return "Main menu · " + moduleLabel + (catName ? " · " + catName : "");
  }

  function enterPlayback(title, snapshot) {
    if (playing) return;
    resumeBrowse = snapshot || captureBrowseState();
    playbackCategory = resumeBrowse.catName || moduleLabel || "Live TV";
    playing = true;
    nativePlayerActive = true;
    playbackTitle = title || resumeBrowse.itemName || "";
    hidePortalUi();
    document.getElementById("playback-ui").classList.add("active");
    updatePlaybackBar(playbackTitle, playbackCategory);
    document.getElementById("btn-playback-back").classList.add("focused");
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    portalVolume = readVolumeLevel();
    if (typeof portalVolume !== "number" || isNaN(portalVolume)) portalVolume = 50;
    if (!html5Playback) {
      var nativeRoot = typeof stb !== "undefined" ? stb : (typeof gSTB !== "undefined" ? gSTB : null);
      if (nativeRoot) prepareVideoLayer(nativeRoot);
    }
  }

  function exitPlayback(stopPlayer) {
    if (!playing) return;
    var snapshot = resumeBrowse || captureBrowseState();
    var closingStream = activeStreamId;
    playing = false;
    loading = false;
    resumeBrowse = null;
    activeStreamId = null;
    suppressPlayerStop = true;
    if (stopPlayer !== false) stopNativePlayer();
    else nativePlayerActive = false;
    suppressPlayerStop = false;
    if (closingStream) notifyDisconnect(closingStream);
    document.getElementById("playback-ui").classList.remove("active");
    document.body.style.background = "";
    document.documentElement.style.background = "";
    showPortalUi();
    restoreBrowseAfterPlayback(snapshot);
  }

  function html5Capable() {
    return typeof MediaSource !== "undefined";
  }

  function hlsMediaUrl(url) {
    var s = String(url || "");
    var q = s.indexOf("?");
    var h = s.indexOf("#");
    var cut = s.length;
    if (q >= 0 && q < cut) cut = q;
    if (h >= 0 && h < cut) cut = h;
    var base = s.slice(0, cut);
    var rest = s.slice(cut);
    if (base.length >= 3 && base.slice(base.length - 3).toLowerCase() === ".ts") {
      return base.slice(0, base.length - 3) + ".m3u8" + rest;
    }
    return s;
  }

  function ensureHtml5Video() {
    var v = document.getElementById("html5player");
    if (v) return v;
    v = document.createElement("video");
    v.id = "html5player";
    v.setAttribute("playsinline", "playsinline");
    v.setAttribute("webkit-playsinline", "true");
    v.setAttribute("autoplay", "autoplay");
    v.muted = true;
    v.controls = false;
    v.preload = "auto";
    v.onclick = function () { kickHtml5Play(); };
    v.ontouchend = function () { kickHtml5Play(); };
    document.body.appendChild(v);
    return v;
  }

  function kickHtml5Play() {
    var v = document.getElementById("html5player");
    if (!v) return;
    try { v.muted = true; } catch (e) {}
    var p = v.play();
    function unmute() {
      try { v.muted = false; } catch (e) {}
      applyHtml5Volume();
    }
    if (p && p.then) {
      p.then(function () { unmute(); }).catch(function () {
        reportDeviceEvent("html5_blocked");
      });
    } else unmute();
  }

  function applyHtml5Volume() {
    var v = document.getElementById("html5player");
    if (v) v.volume = Math.max(0, Math.min(1, (typeof portalVolume === "number" ? portalVolume : 100) / 100));
  }

  function stopHtml5() {
    html5Playback = false;
    document.documentElement.classList.remove("html5-play");
    document.body.classList.remove("html5-play");
    try { if (html5Hls) html5Hls.destroy(); } catch (e) {}
    html5Hls = null;
    try { if (html5TsPlayer) html5TsPlayer.destroy(); } catch (e) {}
    html5TsPlayer = null;
    var v = document.getElementById("html5player");
    if (v) {
      try { v.pause(); } catch (e) {}
      try { v.removeAttribute("src"); v.load(); } catch (e) {}
    }
  }

  function loadScript(src, done) {
    var existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      if (src.indexOf("mpegts") >= 0 && window.mpegts) return done();
      if (src.indexOf("hls") >= 0 && window.Hls) return done();
      existing.addEventListener("load", function () { done(); });
      existing.addEventListener("error", function () { done(); });
      return;
    }
    var s = document.createElement("script");
    s.src = src;
    s.onload = function () { done(); };
    s.onerror = function () { done(); };
    document.head.appendChild(s);
  }

  function startHtml5(url, title, snapshot) {
    html5Playback = true;
    if (!playing) enterPlayback(title, snapshot);
    else {
      updatePlaybackBar(playbackTitle, playbackCategory);
      hidePortalUi();
    }
    var v = ensureHtml5Video();
    applyHtml5Volume();
    var tsUrl = sameOriginMediaUrl(url);
    var hlsUrl = hlsMediaUrl(tsUrl);
    function playNativeHls() {
      v.src = hlsUrl;
      kickHtml5Play();
      reportDeviceEvent("html5_tag");
    }
    function attachHls() {
      if (window.Hls && window.Hls.isSupported()) {
        try { if (html5Hls) html5Hls.destroy(); } catch (e) {}
        html5Hls = new window.Hls({
          enableWorker: false,
          lowLatencyMode: true,
          maxBufferLength: 12,
          liveDurationInfinity: true,
          liveSyncDurationCount: 3
        });
        html5Hls.loadSource(hlsUrl);
        html5Hls.attachMedia(v);
        html5Hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
          kickHtml5Play();
        });
        html5Hls.on(window.Hls.Events.ERROR, function (_ev, data) {
          if (!data || !data.fatal) return;
          reportDeviceEvent("html5_hlserr");
          try { html5Hls.destroy(); } catch (e) {}
          html5Hls = null;
          if (!attachMpegTs()) playNativeHls();
        });
        reportDeviceEvent("html5_hls");
        return true;
      }
      return false;
    }
    function attachMpegTs() {
      if (window.mpegts && window.mpegts.isSupported && window.mpegts.isSupported()) {
        try { if (html5TsPlayer) html5TsPlayer.destroy(); } catch (e) {}
        html5TsPlayer = window.mpegts.createPlayer(
          { type: "mpegts", isLive: true, url: tsUrl, cors: true },
          { enableStashBuffer: true, stashInitialSize: 131072, liveBufferLatencyChasing: true }
        );
        html5TsPlayer.attachMediaElement(v);
        html5TsPlayer.load();
        kickHtml5Play();
        reportDeviceEvent("html5_ts");
        return true;
      }
      return false;
    }
    loadScript("/hls.min.js", function () {
      if (attachHls()) return;
      loadScript("/mpegts.min.js", function () {
        if (!attachMpegTs()) playNativeHls();
      });
    });
    return true;
  }

  function ensurePlayerInited() {
    stbCall(function () {
      if (typeof stb !== "undefined" && stb.InitPlayer) stb.InitPlayer();
      if (typeof gSTB !== "undefined" && gSTB.InitPlayer) gSTB.InitPlayer();
    });
  }

  function sameOriginMediaUrl(url) {
    try {
      var here = window.location;
      if (!here || !here.host || String(here.protocol || "").indexOf("http") !== 0) return url;
      var u = new URL(url, here.href);
      if (!/^https?:$/i.test(u.protocol)) return url;
      u.protocol = here.protocol;
      u.host = here.host;
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function prepareVideoLayer(nativeRoot) {
    stbCall(function () {
      var w = window.innerWidth || 1280;
      var h = window.innerHeight || 720;
      if (nativeRoot.SetViewport) nativeRoot.SetViewport(0, 0, w, h);
      if (nativeRoot.SetPosX) nativeRoot.SetPosX(0);
      if (nativeRoot.SetPosY) nativeRoot.SetPosY(0);
      if (nativeRoot.SetWidth) nativeRoot.SetWidth(w);
      if (nativeRoot.SetHeight) nativeRoot.SetHeight(h);
      // MAG: 0 = fullscreen. SetPIG(1, 0, …) is a zero-size PIG window on StbEmu.
      if (nativeRoot.SetPIG) nativeRoot.SetPIG(0, 0, 0, 0);
      if (nativeRoot.SetTransparent) nativeRoot.SetTransparent(true);
      if (nativeRoot.SetVolume) nativeRoot.SetVolume(typeof portalVolume === "number" ? portalVolume : 100);
    });
    setTopWindow(0);
  }

  function playUrl(rawCmd, title, snapshot) {
    if (!rawCmd) { showError("No playback URL"); return; }
    var url = sameOriginMediaUrl(playableUrl(rawCmd));
    if (!url) { showError("No playback URL"); return; }
    playbackTitle = title || (snapshot && snapshot.itemName) || "";
    bindPlayerCallbacks();
    ensurePlayerInited();
    if (html5Capable()) {
      startHtml5(url, title, snapshot);
      return;
    }
    var solution = playerSolution(url);
    var magCmd = /^https?:\/\//i.test(url) ? (solution + " " + url) : rawCmd;
    var started = false;
    var nativeRoot = typeof stb !== "undefined" ? stb : (typeof gSTB !== "undefined" ? gSTB : null);
    try {
      if (!nativeRoot) {
        showError("Native player not available");
        return;
      }
      if (!playing) enterPlayback(title, snapshot);
      else updatePlaybackBar(playbackTitle, playbackCategory);
      prepareVideoLayer(nativeRoot);
      if (nativeRoot.Play) {
        try {
          nativeRoot.Play(magCmd);
          reportDeviceEvent("native_play", (window.location && window.location.host) || "");
          started = true;
        } catch (e) {
          started = false;
        }
      }
      if (!started && nativeRoot.player && nativeRoot.player.play) {
        try {
          nativeRoot.player.play({ uri: url, solution: solution, playStr: magCmd, name: title || "" });
          reportDeviceEvent("native_play_player");
          started = true;
        } catch (e) {
          started = false;
        }
      }
      if (!started && nativeRoot.PlaySolution) {
        try {
          nativeRoot.PlaySolution(solution, url);
          reportDeviceEvent("native_play_solution");
          started = true;
        } catch (e) {
          started = false;
        }
      }
      if (started) {
        setTimeout(function () { keepRemoteInPortal(); }, 50);
        setTimeout(function () { keepRemoteInPortal(); }, 400);
        return;
      }
    } catch (e) {
      exitPlayback(true);
      showError("Player error");
      return;
    }
    exitPlayback(true);
    showError("Native player not available");
  }

  function playableUrl(cmd) {
    return String(cmd || "").replace(/^(ffmpeg|auto|ffrt|mpegts|mpegps|mp4)\s+/i, "").trim();
  }

  function playCmd(cmd) {
    if (!cmd) return;
    reportDeviceEvent("play_requested");
    var seq = ++playSeq;
    var prevStream = activeStreamId;
    var snapshot = captureBrowseState();
    var title = snapshot.itemName || (items[idxItem] && items[idxItem].name);
    var streamId = streamIdFromCmd(cmd);
    if (prevStream && prevStream !== streamId) {
      notifyDisconnect(prevStream);
    }
    loading = true;
    document.getElementById("items").innerHTML = '<div class="status">Starting playback…</div>';
    api("create_link", (module && module.apiType) || "stb", { cmd: cmd }).then(function (r) {
      if (seq !== playSeq) return;
      loading = false;
      var raw = r.js && r.js.cmd;
      if (raw) {
        activeStreamId = streamId;
        playUrl(raw, title, snapshot);
      } else showError((r.js && r.js.error) || "Playback failed");
    }).catch(function (e) {
      if (seq !== playSeq) return;
      loading = false;
      showError((e && e.message) || "Playback request failed");
    });
  }

  function activateItem(el) {
    if (!el || loading) return;
    var isSeries = el.getAttribute("data-series") === "1";
    var id = el.getAttribute("data-id");
    var cmd = el.getAttribute("data-cmd");
    if (module.id === "series" && isSeries && !seriesPick) {
      seriesPick = id;
      curPage = 0;
      setCrumb("Main menu · Series · " + (items[idxItem] && items[idxItem].name || ""));
      loadItems(categories[idxCat] ? categories[idxCat].id : "0", 0);
      return;
    }
    if (cmd) playCmd(cmd);
  }

  function changePage(delta) {
    var pages = Math.ceil(totalItems / PAGE);
    if (pages <= 1) return;
    var next = curPage + delta;
    if (next < 0 || next >= pages) return;
    idxItem = 0;
    loadItems(categories[idxCat] ? categories[idxCat].id : "0", next);
  }

  function keyCode(ev) { return ev.keyCode || ev.which || 0; }

  function onKey(ev) {
    var code = keyCode(ev);
    var key = ev.key || "";
    reportDeviceEvent("dom_key", code);
    var now = Date.now();
    if (code === lastKey && now - lastKeyAt < (playing ? 90 : 140)) return;
    lastKey = code;
    lastKeyAt = now;

    var left = code === 37 || code === 21 || key === "ArrowLeft";
    var up = code === 38 || code === 19 || key === "ArrowUp";
    var right = code === 39 || code === 22 || key === "ArrowRight";
    var down = code === 40 || code === 20 || key === "ArrowDown";
    var enter = isEnterKey(code, key);
    var back = isBackKey(code, key);
    var chUp = code === 427 || code === 33;
    var chDown = code === 428 || code === 34;

    if (isVolumeKey(code, key)) {
      if (adjustVolume(code, key)) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
      }
      return;
    }

    if (playing) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      handlePlaybackRemote(code, key);
      return;
    }

    if (screen === "menu") {
      if (up && idxMenu > 0) { idxMenu--; focusRows(document.getElementById("main-menu"), idxMenu); ev.preventDefault(); }
      else if (down && idxMenu < MODULES.length - 1) { idxMenu++; focusRows(document.getElementById("main-menu"), idxMenu); ev.preventDefault(); }
      else if (enter) { openModule(); ev.preventDefault(); }
      return;
    }

    if ((screen === "error" || screen === "loading") && (enter || back)) {
      renderMainMenu();
      ev.preventDefault();
      return;
    }

    if (screen === "browse") {
      if (back) {
        if (seriesPick) {
          seriesPick = null;
          curPage = 0;
          setCrumb("Main menu · Series");
          loadItems(categories[idxCat] ? categories[idxCat].id : "0", 0);
        } else {
          renderMainMenu();
        }
        ev.preventDefault();
        return;
      }
      if (chUp) { changePage(-1); ev.preventDefault(); return; }
      if (chDown) { changePage(1); ev.preventDefault(); return; }
      if (left) { pane = "cats"; focusRows(document.getElementById("cats"), idxCat); updateBrowseContextBar(); ev.preventDefault(); return; }
      if (right) { pane = "items"; focusRows(document.getElementById("items"), idxItem); updateBrowseContextBar(); ev.preventDefault(); return; }

      if (pane === "cats") {
        if (up && idxCat > 0) { idxCat--; focusRows(document.getElementById("cats"), idxCat); updateBrowseContextBar(); ev.preventDefault(); }
        else if (down && idxCat < categories.length - 1) { idxCat++; focusRows(document.getElementById("cats"), idxCat); updateBrowseContextBar(); ev.preventDefault(); }
        else if (enter) {
          curPage = 0;
          idxItem = 0;
          setCrumb(browseCrumb());
          loadItems(categories[idxCat] ? categories[idxCat].id : "0", 0);
          ev.preventDefault();
        }
      } else {
        var itemRows = rowsIn(document.getElementById("items"));
        if (!itemRows.length) return;
        if (up && idxItem > 0) { idxItem--; focusRows(document.getElementById("items"), idxItem); updateBrowseContextBar(); ev.preventDefault(); }
        else if (down) {
          if (idxItem < itemRows.length - 1) {
            idxItem++;
            focusRows(document.getElementById("items"), idxItem);
            updateBrowseContextBar();
          } else {
            changePage(1);
          }
          ev.preventDefault();
        } else if (enter) { activateItem(itemRows[idxItem]); ev.preventDefault(); }
      }
    }
  }

  document.addEventListener("keydown", onKey, true);
  window.addEventListener("keydown", onKey, true);

  function startPortal(nextMac) {
    mac = normalizeMac(nextMac);
    document.getElementById("mac-line").textContent = mac ? ("MAC " + mac) : "MAC unknown";
    if (!mac) {
      showError("Waiting for device MAC. StbEmu must send the registered MAC to the portal; no per-device URL is used.");
      return;
    }
    reportDeviceEvent("boot");
    api("handshake", "stb").then(function (r) {
      if (!r.js || r.js.authorized !== 1) {
        showError((r.js && r.js.error) || "Authorization failed");
        return;
      }
      token = r.js.token || "";
      // Set a session cookie with the authorized MAC so all subsequent
      // media / sub-requests inherit the MAC automatically
      try {
        document.cookie = "mac=" + encodeURIComponent(mac) + "; path=/; max-age=86400";
      } catch (e) {}
      return api("get_profile", "stb");
    }).then(function (r) {
      if (!r || !r.js) return;
      profile = r.js;
      document.getElementById("profile").textContent =
        (profile.name || profile.login || "Line") + " · expires " +
        (profile.expires ? new Date(profile.expires * 1000).toLocaleDateString() : "—");
      renderMainMenu();
    }).catch(function () { showError("Could not connect to portal"); });
  }

  // Boot is DOM/network-only. In particular, do not touch stb/gSTB, player,
  // window focus, or transparency APIs: StbEmu Pro can replace this WebView.
  showPortalUi();

  bindStbEvents();
  bindPlaybackUi();
  window.addEventListener("pagehide", function () {
    if (activeStreamId) notifyDisconnect(activeStreamId);
  });
  // Query MAC and cookie are synchronous. Delay the optional native getter
  // until the DOM can paint; do not add player/window/transparency calls here.
  var bootMac = deviceMac();
  if (bootMac) {
    startPortal(bootMac);
  } else {
    setTimeout(function () {
      startPortal(nativeDeviceMac());
    }, 250);
  }
})();
</script>
</body></html>`;
}
