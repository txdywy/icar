/**
 * iCar — 智能汽车查询前端
 */

const CONFIG = {
  API_BASE: (() => {
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (isLocal) return "http://localhost:8787";
    return "https://icar-worker.andylaw2017.workers.dev";
  })(),
  DEBOUNCE_MS: 400,
  CACHE_TTL: 5 * 60 * 1000,
};

const state = { currentView: "home", cache: new Map() };

const $ = (s) => document.querySelector(s);
const dom = {
  searchInput:    $("#searchInput"),
  searchBtn:      $("#searchBtn"),
  searchClear:    $("#searchClear"),
  suggestions:    $("#suggestions"),
  searchBox:      $("#searchBox"),
  quickTags:      $("#quickTags"),
  heroSection:    $("#heroSection"),
  mainContent:    $("#mainContent"),
  topBar:         $("#topBar"),
  backBtn:        $("#backBtn"),
  backLabel:      $("#backLabel"),
  resultsSection: $("#resultsSection"),
  resultsTitle:   $("#resultsTitle"),
  resultsCount:   $("#resultsCount"),
  carGrid:        $("#carGrid"),
  detailSection:  $("#detailSection"),
  detailImgWrap:  $("#detailImgWrap"),
  detailCover:    $("#detailCover"),
  galleryStrip:   $("#galleryStrip"),
  detailBadge:    $("#detailBadge"),
  detailTitle:    $("#detailTitle"),
  detailSubtitle: $("#detailSubtitle"),
  detailGuidePrice: $("#detailGuidePrice"),
  detailDealerPrice: $("#detailDealerPrice"),
  detailOnRoadPrice: $("#detailOnRoadPrice"),
  priceBreakdown: $("#priceBreakdown"),
  breakdownGrid:  $("#breakdownGrid"),
  configLoading:  $("#configLoading"),
  configTableWrap:$("#configTableWrap"),
  configThead:    $("#configThead"),
  configTbody:    $("#configTbody"),
  stateOverlay:   $("#stateOverlay"),
  stateContent:   $("#stateContent"),
  apiStatus:      $("#apiStatus"),
};

// ── API ──────────────────────────────────────────────────────────────────

async function apiFetch(path) {
  const cached = state.cache.get(path);
  if (cached && Date.now() - cached.ts < CONFIG.CACHE_TTL) return cached.data;
  const resp = await fetch(`${CONFIG.API_BASE}${path}`);
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const data = await resp.json();
  state.cache.set(path, { data, ts: Date.now() });
  return data;
}

// ── Health ───────────────────────────────────────────────────────────────

async function checkHealth() {
  const dot = dom.apiStatus.querySelector(".status-dot");
  try {
    const r = await fetch(`${CONFIG.API_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    dot.className = r.ok ? "status-dot ok" : "status-dot err";
  } catch { dot.className = "status-dot err"; }
}

// ── View ─────────────────────────────────────────────────────────────────

function showView(view) {
  state.currentView = view;
  dom.heroSection.style.display    = view === "home" ? "" : "none";
  dom.mainContent.style.display    = view !== "home" ? "" : "none";
  dom.resultsSection.style.display = view === "results" ? "" : "none";
  dom.detailSection.style.display  = view === "detail" ? "" : "none";
  dom.topBar.style.display         = view !== "home" ? "" : "none";
  dom.backLabel.textContent        = view === "detail" ? "返回列表" : "返回搜索";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Search ───────────────────────────────────────────────────────────────

let debounceTimer = null;

async function performSearch(query) {
  if (!query.trim()) return;
  dom.searchInput.value = query;
  dom.searchClear.style.display = "flex";
  hideSuggestions();
  showOverlay("spinner", "搜索中…");

  try {
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
    hideOverlay();
    if (!data.ok) throw new Error(data.error);
    if (!data.results.length) {
      showOverlay("empty", "未找到结果", `没有找到与"${query}"相关的车型`);
      return;
    }
    renderResults(query, data.results);
    showView("results");
  } catch (err) {
    hideOverlay();
    showOverlay("error", "搜索失败", err.message);
  }
}

// ── Render: Results ──────────────────────────────────────────────────────

function renderResults(query, results) {
  dom.resultsTitle.textContent = `"${query}" 的搜索结果`;
  dom.resultsCount.textContent = `${results.length} 个车系`;

  dom.carGrid.innerHTML = results.map(car => {
    const img = car.cover
      ? `<img src="${esc(car.cover)}" alt="${esc(car.seriesName)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=emoji-fallback>🚗</div>'">`
      : '<div class="emoji-fallback">🚗</div>';
    const badge = car.energyType ? `<span class="car-card-badge">${esc(car.energyType)}</span>` : "";
    const gp = car.guidePrice ? `${esc(car.guidePrice)}万` : "暂无";
    const dp = car.dealerPrice ? `${esc(car.dealerPrice)}万` : "暂无";

    return `
      <article class="car-card" data-id="${car.seriesId}" tabindex="0">
        <div class="car-card-img">${img}${badge}</div>
        <div class="car-card-body">
          <h3 class="car-card-name">${esc(car.seriesName)}</h3>
          <p class="car-card-brand">${esc(car.brandName)}</p>
          <div class="car-card-prices">
            <div><span class="car-card-price-label">指导价</span><span class="car-card-price-value guide">${gp}</span></div>
            <div><span class="car-card-price-label">经销商报价</span><span class="car-card-price-value dealer">${dp}</span></div>
          </div>
        </div>
      </article>`;
  }).join("");

  dom.carGrid.querySelectorAll(".car-card").forEach(c =>
    c.addEventListener("click", () => loadDetail(c.dataset.id))
  );
}

// ── Render: Detail ───────────────────────────────────────────────────────

async function loadDetail(seriesId) {
  showOverlay("spinner", "加载详情…");

  try {
    const data = await apiFetch(`/api/series/${seriesId}`);
    hideOverlay();
    if (!data.ok) throw new Error(data.error);
    renderDetail(data.detail);
    showView("detail");
  } catch (err) {
    hideOverlay();
    showOverlay("error", "加载失败", err.message);
  }
}

function renderDetail(d) {
  // Badge
  dom.detailBadge.textContent = [d.brandName, d.energyType].filter(Boolean).join(" · ");

  // Cover image
  if (d.cover) {
    dom.detailCover.src = d.cover;
    dom.detailCover.alt = d.seriesName;
    dom.detailCover.style.display = "";
  } else {
    dom.detailCover.style.display = "none";
  }

  // Gallery
  if (d.gallery && d.gallery.length > 1) {
    dom.galleryStrip.style.display = "flex";
    dom.galleryStrip.innerHTML = d.gallery.map((url, i) =>
      `<img class="gallery-thumb${i === 0 ? " active" : ""}" src="${esc(url)}" data-src="${esc(url)}" alt="">`
    ).join("");
    dom.galleryStrip.querySelectorAll(".gallery-thumb").forEach(thumb => {
      thumb.addEventListener("click", () => {
        dom.galleryStrip.querySelectorAll(".gallery-thumb").forEach(t => t.classList.remove("active"));
        thumb.classList.add("active");
        dom.detailCover.src = thumb.dataset.src;
      });
    });
  } else {
    dom.galleryStrip.style.display = "none";
  }

  // Meta
  dom.detailTitle.textContent = d.seriesName;
  dom.detailSubtitle.textContent = d.carType || "";
  dom.detailGuidePrice.textContent = d.guidePrice ? `${d.guidePrice}万` : "—";
  dom.detailDealerPrice.textContent = d.dealerPrice ? `${d.dealerPrice}万` : "—";
  dom.detailOnRoadPrice.textContent = d.onRoad ? d.onRoad.totalOnRoadDisplay : "—";

  // Breakdown
  if (d.onRoad) {
    renderBreakdown(d.onRoad);
    dom.priceBreakdown.style.display = "";
  } else {
    dom.priceBreakdown.style.display = "none";
  }

  // Models table
  const models = d.models || [];
  if (models.length) {
    dom.configLoading.style.display = "none";
    dom.configTableWrap.style.display = "";
    renderModels(models);
  } else {
    dom.configLoading.innerHTML = '<div style="font-size:2rem;margin-bottom:8px">📋</div><p>暂无车型数据</p>';
    dom.configTableWrap.style.display = "none";
  }
}

function renderBreakdown(o) {
  const items = [
    { l: "裸车价", v: `¥${(o.guidePrice * 10000).toLocaleString()}` },
    { l: "购置税", v: o.purchaseTax === 0 ? "免征" : `¥${o.purchaseTax.toLocaleString()}`, free: o.purchaseTax === 0 },
    { l: "交强险", v: `¥${o.compulsoryInsurance.toLocaleString()}` },
    { l: "商业险", v: `¥${o.commercialInsurance.toLocaleString()}` },
    { l: "上牌费", v: `¥${o.registrationFee.toLocaleString()}` },
    { l: "车船税", v: `¥${o.vesselTax.toLocaleString()}` },
    { l: "落地价合计", v: `¥${o.totalOnRoad.toLocaleString()}`, total: true },
  ];
  dom.breakdownGrid.innerHTML = items.map(i =>
    `<div class="breakdown-item${i.total ? " total" : ""}${i.free ? " free" : ""}">
       <div class="bl">${i.l}</div><div class="bv">${i.v}</div>
     </div>`
  ).join("");
}

function renderModels(models) {
  dom.configThead.innerHTML = `<tr><th>车型</th><th>指导价</th><th>经销商报价</th><th>预估落地价</th></tr>`;
  dom.configTbody.innerHTML = models.map(m => {
    const onroad = m.onRoad ? m.onRoad.totalOnRoadDisplay : "—";
    return `<tr>
      <td>${esc(m.name)}</td>
      <td>${m.guidePrice ? esc(m.guidePrice) + "万" : "—"}</td>
      <td>${m.dealerPrice ? esc(m.dealerPrice) + "万" : "—"}</td>
      <td class="onroad-cell">${onroad}</td>
    </tr>`;
  }).join("");
}

// ── Suggestions ──────────────────────────────────────────────────────────

let suggestAbort = null;

async function fetchSuggestions(q) {
  if (!q || q.length < 1) { hideSuggestions(); return; }
  try {
    if (suggestAbort) suggestAbort.abort();
    suggestAbort = new AbortController();
    const resp = await fetch(`${CONFIG.API_BASE}/api/search?q=${encodeURIComponent(q)}`, { signal: suggestAbort.signal });
    const data = await resp.json();
    if (!data.ok || !data.results.length) { hideSuggestions(); return; }
    renderSuggestions(data.results.slice(0, 6));
  } catch (e) { if (e.name !== "AbortError") hideSuggestions(); }
}

function renderSuggestions(results) {
  dom.suggestions.innerHTML = results.map(car => {
    const img = car.cover
      ? `<img class="sug-img" src="${esc(car.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : "";
    return `
      <div class="sug-item" data-id="${car.seriesId}">
        ${img}
        <div class="sug-info">
          <div class="sug-name">${esc(car.seriesName)}</div>
          <div class="sug-meta">${esc(car.brandName)}${car.energyType ? " · " + esc(car.energyType) : ""}</div>
        </div>
        <span class="sug-price">${car.guidePrice ? esc(car.guidePrice) + "万" : ""}</span>
      </div>`;
  }).join("");
  dom.suggestions.style.display = "block";
  dom.suggestions.querySelectorAll(".sug-item").forEach(item =>
    item.addEventListener("click", () => { hideSuggestions(); loadDetail(item.dataset.id); })
  );
}

function hideSuggestions() { dom.suggestions.style.display = "none"; }

// ── Overlay ──────────────────────────────────────────────────────────────

function showOverlay(type, title, desc) {
  let icon = "";
  if (type === "spinner") icon = `<div class="spinner dark" style="width:32px;height:32px;border-width:3px;margin:0 auto 16px"></div>`;
  else if (type === "error") icon = '<div class="overlay-icon">😵</div>';
  else if (type === "empty") icon = '<div class="overlay-icon">🔍</div>';
  const btn = type === "empty" ? '<button class="overlay-btn" id="overlayBack">返回搜索</button>' : "";
  dom.stateContent.innerHTML = `${icon}<div class="overlay-title">${esc(title)}</div>${desc ? `<div class="overlay-desc">${esc(desc)}</div>` : ""}${btn}`;
  dom.stateOverlay.style.display = "flex";
  if (type === "empty") {
    $("#overlayBack").addEventListener("click", () => { hideOverlay(); showView("home"); dom.searchInput.focus(); });
  }
}

function hideOverlay() { dom.stateOverlay.style.display = "none"; }

// ── Utils ────────────────────────────────────────────────────────────────

function esc(s) { if (!s) return ""; const el = document.createElement("span"); el.textContent = String(s); return el.innerHTML; }

// ── Events ───────────────────────────────────────────────────────────────

function bind() {
  const debSuggest = debounce(fetchSuggestions, CONFIG.DEBOUNCE_MS);

  dom.searchInput.addEventListener("input", e => {
    dom.searchClear.style.display = e.target.value ? "flex" : "none";
    debSuggest(e.target.value.trim());
  });
  dom.searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); performSearch(dom.searchInput.value.trim()); }
    if (e.key === "Escape") hideSuggestions();
  });
  dom.searchInput.addEventListener("focus", () => {
    if (dom.searchInput.value.trim().length > 1) debSuggest(dom.searchInput.value.trim());
  });

  dom.searchBtn.addEventListener("click", () => performSearch(dom.searchInput.value.trim()));
  dom.searchClear.addEventListener("click", () => {
    dom.searchInput.value = ""; dom.searchClear.style.display = "none"; hideSuggestions(); dom.searchInput.focus();
  });

  document.addEventListener("click", e => { if (!dom.searchBox.contains(e.target)) hideSuggestions(); });

  dom.quickTags.addEventListener("click", e => {
    const tag = e.target.closest(".quick-tag");
    if (tag) performSearch(tag.dataset.q);
  });

  dom.backBtn.addEventListener("click", () => {
    if (state.currentView === "detail") showView("results");
    else showView("home");
  });

  document.addEventListener("keydown", e => {
    if (e.key === "/" && !["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) {
      e.preventDefault(); dom.searchInput.focus();
    }
  });
}

function debounce(fn, ms) { return (...a) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => fn(...a), ms); }; }

// ── Init ─────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  bind();
  checkHealth();
  showView("home");
  setTimeout(() => dom.searchInput.focus(), 300);
  console.log("🚗 iCar initialized");
});
