/**
 * iCar — 智能汽车查询前端
 *
 * 架构：纯 Vanilla JS，零依赖，SPA 体验
 * 通过 Cloudflare Worker 代理请求，避免 CORS 问题
 */

// ── Configuration ────────────────────────────────────────────────────────

const CONFIG = {
  // Worker API 地址 — 部署后替换为你的 Worker URL
  API_BASE: (() => {
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (isLocal) return "http://localhost:8787";
    return "https://icar-worker.andylaw2017.workers.dev";
  })(),

  DEBOUNCE_MS: 400,
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
};

// ── State ────────────────────────────────────────────────────────────────

const state = {
  currentView: "home", // home | results | detail
  searchResults: [],
  currentSeries: null,
  currentConfigs: [],
  cache: new Map(),
};

// ── DOM Refs ─────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const dom = {
  searchInput:     $("#searchInput"),
  searchBtn:       $("#searchBtn"),
  searchClear:     $("#searchClear"),
  suggestions:     $("#suggestions"),
  searchBox:       $("#searchBox"),
  quickTags:       $("#quickTags"),
  heroSection:     $("#heroSection"),
  mainContent:     $("#mainContent"),
  breadcrumb:      $("#breadcrumb"),
  breadcrumbHome:  $("#breadcrumbHome"),
  breadcrumbCurrent: $("#breadcrumbCurrent"),
  resultsSection:  $("#resultsSection"),
  resultsTitle:    $("#resultsTitle"),
  resultsCount:    $("#resultsCount"),
  carGrid:         $("#carGrid"),
  detailSection:   $("#detailSection"),
  detailHero:      $("#detailHero"),
  detailCover:     $("#detailCover"),
  detailTitle:     $("#detailTitle"),
  detailSubtitle:  $("#detailSubtitle"),
  detailGuidePrice:$("#detailGuidePrice"),
  detailDealerPrice:$("#detailDealerPrice"),
  detailOnRoadPrice:$("#detailOnRoadPrice"),
  detailTags:      $("#detailTags"),
  priceBreakdown:  $("#priceBreakdown"),
  breakdownGrid:   $("#breakdownGrid"),
  configLoading:   $("#configLoading"),
  configTableWrap: $("#configTableWrap"),
  configTable:     $("#configTable"),
  configThead:     $("#configThead"),
  configTbody:     $("#configTbody"),
  hotSection:      $("#hotSection"),
  hotGrid:         $("#hotGrid"),
  stateOverlay:    $("#stateOverlay"),
  stateContent:    $("#stateContent"),
  apiStatus:       $("#apiStatus"),
  navBtns:         $$(".nav-btn"),
};

// ── API Layer ─────────────────────────────────────────────────────────────

async function apiFetch(path) {
  const cacheKey = path;
  const cached = state.cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CONFIG.CACHE_TTL) return cached.data;

  const resp = await fetch(`${CONFIG.API_BASE}${path}`);
  if (!resp.ok) throw new Error(`API ${resp.status}`);

  const data = await resp.json();
  state.cache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

async function apiSearch(query) {
  return apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
}

async function apiSeriesDetail(seriesId) {
  return apiFetch(`/api/series/${seriesId}`);
}

// Config is now included in series detail (models array)

// ── Health Check ──────────────────────────────────────────────────────────

async function checkApiHealth() {
  const dot = dom.apiStatus.querySelector(".status-dot");
  try {
    const resp = await fetch(`${CONFIG.API_BASE}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      dot.classList.add("ok");
      dot.classList.remove("err");
      dom.apiStatus.title = "API 正常";
    } else throw new Error();
  } catch {
    dot.classList.add("err");
    dot.classList.remove("ok");
    dom.apiStatus.title = "API 不可用";
  }
}

// ── View Management ───────────────────────────────────────────────────────

function showView(view) {
  state.currentView = view;

  dom.heroSection.style.display = view === "home" ? "" : "none";
  dom.mainContent.style.display = view !== "home" ? "" : "none";
  dom.resultsSection.style.display = view === "results" ? "" : "none";
  dom.detailSection.style.display = view === "detail" ? "" : "none";
  dom.hotSection.style.display = view === "hot" ? "" : "none";
  dom.breadcrumb.style.display = view !== "home" && view !== "hot" ? "" : "none";

  // Update nav
  dom.navBtns.forEach((btn) => {
    btn.setAttribute(
      "aria-current",
      btn.dataset.tab === (view === "detail" ? "search" : view) ? "page" : "false"
    );
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Search Logic ─────────────────────────────────────────────────────────

let debounceTimer = null;

function debounce(fn, ms) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), ms);
  };
}

async function performSearch(query) {
  if (!query.trim()) return;

  dom.searchInput.value = query;
  dom.searchClear.style.display = "block";
  hideSuggestions();
  showLoading("搜索中...");

  try {
    const data = await apiSearch(query);

    if (!data.ok) throw new Error(data.error || "搜索失败");

    hideOverlay();

    if (data.results.length === 0) {
      showEmpty("未找到匹配结果", `没有找到与"${query}"相关的车型，换个关键词试试？`);
      return;
    }

    state.searchResults = data.results;
    renderSearchResults(query, data.results);
    showView("results");
  } catch (err) {
    hideOverlay();
    showError("搜索失败", err.message || "网络请求失败，请稍后重试");
  }
}

// ── Render: Search Results ────────────────────────────────────────────────

function renderSearchResults(query, results) {
  dom.resultsTitle.textContent = `"${query}" 的搜索结果`;
  dom.resultsCount.textContent = `共 ${results.length} 个车系`;
  dom.breadcrumbCurrent.textContent = `搜索: ${query}`;

  dom.carGrid.innerHTML = results.map((car) => renderCarCard(car)).join("");

  // Attach click handlers
  dom.carGrid.querySelectorAll(".car-card").forEach((card) => {
    card.addEventListener("click", () => {
      const seriesId = card.dataset.seriesId;
      if (seriesId) loadSeriesDetail(seriesId);
    });
  });
}

function renderCarCard(car) {
  const guidePrice = car.guidePrice || "暂无报价";
  const dealerPrice = car.dealerPrice || "暂无";

  return `
    <article class="car-card" data-series-id="${car.seriesId}" tabindex="0" role="button" aria-label="${car.seriesName}">
      <div class="car-card-img-wrap">
        ${
          car.cover
            ? `<img class="car-card-img" src="${escapeHtml(car.cover)}" alt="${escapeHtml(car.seriesName)}" loading="lazy" onerror="this.style.display='none'"/>`
            : '<div style="font-size:3rem;">🚗</div>'
        }
        ${car.energyType ? `<span class="car-card-badge">${escapeHtml(car.energyType)}</span>` : ""}
      </div>
      <div class="car-card-body">
        <h3 class="car-card-name">${escapeHtml(car.seriesName)}</h3>
        <p class="car-card-brand">${escapeHtml(car.brandName)}</p>
        <div class="car-card-prices">
          <div class="car-card-price">
            <span class="car-card-price-label">指导价</span>
            <span class="car-card-price-value">${escapeHtml(guidePrice)}万</span>
          </div>
          <div class="car-card-price">
            <span class="car-card-price-label">经销商报价</span>
            <span class="car-card-price-value">${escapeHtml(dealerPrice)}万</span>
          </div>
        </div>
      </div>
    </article>`;
}

// ── Render: Series Detail ─────────────────────────────────────────────────

async function loadSeriesDetail(seriesId) {
  showLoading("加载车型详情...");

  try {
    const seriesData = await apiSeriesDetail(seriesId);
    hideOverlay();

    if (!seriesData.ok) throw new Error(seriesData.error || "加载失败");

    const detail = seriesData.detail;
    state.currentSeries = detail;
    state.currentConfigs = detail.models || [];

    renderSeriesDetail(detail, state.currentConfigs);
    showView("detail");
    dom.breadcrumbCurrent.textContent = detail.seriesName;
  } catch (err) {
    hideOverlay();
    showError("加载失败", err.message || "无法加载车型详情");
  }
}

function renderSeriesDetail(detail, models) {
  // Hero
  if (detail.cover) {
    dom.detailCover.src = detail.cover;
    dom.detailCover.alt = detail.seriesName;
    dom.detailCover.style.display = "";
  } else {
    dom.detailCover.style.display = "none";
  }

  dom.detailTitle.textContent = detail.seriesName;
  dom.detailSubtitle.textContent = [detail.brandName, detail.carType, detail.energyType]
    .filter(Boolean)
    .join(" · ");

  dom.detailGuidePrice.textContent = detail.guidePrice ? `${detail.guidePrice}万` : "暂无";
  dom.detailDealerPrice.textContent = detail.dealerPrice ? `${detail.dealerPrice}万` : "暂无";

  // Tags
  dom.detailTags.innerHTML = "";

  // Price breakdown
  if (detail.onRoad) {
    dom.detailOnRoadPrice.textContent = detail.onRoad.totalOnRoadDisplay;
    renderPriceBreakdown(detail.onRoad);
    dom.priceBreakdown.style.display = "";
  } else {
    dom.detailOnRoadPrice.textContent = "暂无";
    dom.priceBreakdown.style.display = "none";
  }

  // Config table — now shows model variants
  if (models.length > 0) {
    dom.configLoading.style.display = "none";
    dom.configTableWrap.style.display = "";
    renderModelTable(models);
  } else {
    dom.configLoading.innerHTML = '<div class="empty-illustration">📋</div><p>暂无车型数据</p>';
  }
}

function renderModelTable(models) {
  dom.configThead.innerHTML = `<tr>
    <th style="min-width:200px;">车型</th>
    <th>指导价</th>
    <th>经销商报价</th>
    <th>预估落地价</th>
  </tr>`;

  dom.configTbody.innerHTML = models
    .map(
      (m) => `<tr>
        <td>${escapeHtml(m.name)}</td>
        <td>${m.guidePrice ? escapeHtml(m.guidePrice) + "万" : "-"}</td>
        <td>${m.dealerPrice ? escapeHtml(m.dealerPrice) + "万" : "-"}</td>
        <td style="color:var(--c-onroad);font-weight:700;">${m.onRoad ? m.onRoad.totalOnRoadDisplay : "-"}</td>
      </tr>`
    )
    .join("");
}

function renderPriceBreakdown(onRoad) {
  const items = [
    { label: "裸车价", value: `¥${(onRoad.guidePrice * 10000).toLocaleString()}` },
    { label: "购置税", value: onRoad.purchaseTax === 0 ? "免征" : `¥${onRoad.purchaseTax.toLocaleString()}`, free: onRoad.purchaseTax === 0 },
    { label: "交强险", value: `¥${onRoad.compulsoryInsurance.toLocaleString()}` },
    { label: "商业险", value: `¥${onRoad.commercialInsurance.toLocaleString()}` },
    { label: "上牌费", value: `¥${onRoad.registrationFee.toLocaleString()}` },
    { label: "车船税", value: `¥${onRoad.vesselTax.toLocaleString()}` },
    { label: "落地价合计", value: `¥${onRoad.totalOnRoad.toLocaleString()}`, total: true },
  ];

  dom.breakdownGrid.innerHTML = items
    .map(
      (item) => `
      <div class="breakdown-item ${item.total ? "total" : ""} ${item.free ? "free" : ""}">
        <div class="breakdown-item-label">${item.label}</div>
        <div class="breakdown-item-value">${item.value}</div>
      </div>`
    )
    .join("");
}

// renderModelTable defined above replaces renderConfigTable

// ── Suggestions ──────────────────────────────────────────────────────────

let suggestAbort = null;

async function fetchSuggestions(query) {
  if (!query || query.length < 1) {
    hideSuggestions();
    return;
  }

  try {
    if (suggestAbort) suggestAbort.abort();
    suggestAbort = new AbortController();

    const resp = await fetch(
      `${CONFIG.API_BASE}/api/search?q=${encodeURIComponent(query)}`,
      { signal: suggestAbort.signal }
    );
    const data = await resp.json();

    if (!data.ok || !data.results.length) {
      hideSuggestions();
      return;
    }

    renderSuggestions(data.results.slice(0, 6));
  } catch (e) {
    if (e.name !== "AbortError") hideSuggestions();
  }
}

function renderSuggestions(results) {
  dom.suggestions.innerHTML = results
    .map(
      (car) => `
      <div class="suggestion-item" data-series-id="${car.seriesId}">
        ${
          car.cover
            ? `<img class="suggestion-img" src="${escapeHtml(car.cover)}" alt="" loading="lazy" onerror="this.style.display='none'"/>`
            : '<div class="suggestion-img" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🚗</div>'
        }
        <div class="suggestion-info">
          <div class="suggestion-name">${escapeHtml(car.seriesName)}</div>
          <div class="suggestion-meta">${escapeHtml(car.brandName)}${car.energyType ? " · " + escapeHtml(car.energyType) : ""}</div>
        </div>
        <span class="suggestion-price">${car.guidePrice ? escapeHtml(car.guidePrice) + "万" : ""}</span>
      </div>`
    )
    .join("");

  dom.suggestions.style.display = "block";

  // Click handlers
  dom.suggestions.querySelectorAll(".suggestion-item").forEach((item) => {
    item.addEventListener("click", () => {
      const seriesId = item.dataset.seriesId;
      hideSuggestions();
      if (seriesId) loadSeriesDetail(seriesId);
    });
  });
}

function hideSuggestions() {
  dom.suggestions.style.display = "none";
}

// ── Hot Cars ──────────────────────────────────────────────────────────────

const HOT_CARS = [
  { emoji: "🟢", name: "Model Y", query: "特斯拉 Model Y" },
  { emoji: "🔴", name: "秦PLUS DM-i", query: "比亚迪 秦PLUS" },
  { emoji: "🔵", name: "问界 M7", query: "问界 M7" },
  { emoji: "🟠", name: "小米 SU7", query: "小米 SU7" },
  { emoji: "🟡", name: "理想 L6", query: "理想 L6" },
  { emoji: "🟣", name: "蔚来 ET5", query: "蔚来 ET5" },
  { emoji: "⚪", name: "宝马 3系", query: "宝马 3系" },
  { emoji: "⚫", name: "奔驰 C级", query: "奔驰 C级" },
  { emoji: "🟢", name: "小鹏 P7", query: "小鹏 P7" },
  { emoji: "🔴", name: "汉 EV", query: "比亚迪 汉" },
  { emoji: "🔵", name: "极氪 007", query: "极氪 007" },
  { emoji: "🟤", name: "奥迪 A4L", query: "奥迪 A4L" },
];

function renderHotCars() {
  dom.hotGrid.innerHTML = HOT_CARS.map(
    (car) => `
    <div class="hot-card" data-query="${escapeHtml(car.query)}">
      <div class="hot-card-emoji">${car.emoji}</div>
      <div class="hot-card-name">${escapeHtml(car.name)}</div>
    </div>`
  ).join("");

  dom.hotGrid.querySelectorAll(".hot-card").forEach((card) => {
    card.addEventListener("click", () => {
      performSearch(card.dataset.query);
    });
  });
}

// ── Overlay States ────────────────────────────────────────────────────────

function showOverlay(html) {
  dom.stateContent.innerHTML = html;
  dom.stateOverlay.style.display = "flex";
}

function hideOverlay() {
  dom.stateOverlay.style.display = "none";
}

function showLoading(msg) {
  showOverlay(`
    <div class="spinner" style="width:32px;height:32px;border-width:3px;border-color:var(--c-border);border-top-color:var(--c-accent);"></div>
    <p style="margin-top:16px;color:var(--c-text-2);">${escapeHtml(msg)}</p>
  `);
}

function showError(title, desc) {
  showOverlay(`
    <div class="state-icon">😵</div>
    <div class="state-title">${escapeHtml(title)}</div>
    <div class="state-desc">${escapeHtml(desc)}</div>
    <button class="state-btn" onclick="location.reload()">刷新页面</button>
  `);
}

function showEmpty(title, desc) {
  showOverlay(`
    <div class="empty-illustration">🔍</div>
    <div class="state-title">${escapeHtml(title)}</div>
    <div class="state-desc">${escapeHtml(desc)}</div>
    <button class="state-btn" id="emptyBackBtn">返回搜索</button>
  `);
  $("#emptyBackBtn").addEventListener("click", () => {
    hideOverlay();
    showView("home");
    dom.searchInput.focus();
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return "";
  const el = document.createElement("span");
  el.textContent = String(str);
  return el.innerHTML;
}

// ── Event Bindings ────────────────────────────────────────────────────────

function bindEvents() {
  // Search input
  const debouncedSuggest = debounce(fetchSuggestions, CONFIG.DEBOUNCE_MS);

  dom.searchInput.addEventListener("input", (e) => {
    const val = e.target.value;
    dom.searchClear.style.display = val ? "block" : "none";
    debouncedSuggest(val.trim());
  });

  dom.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      performSearch(dom.searchInput.value.trim());
    }
    if (e.key === "Escape") hideSuggestions();
  });

  dom.searchInput.addEventListener("focus", () => {
    if (dom.searchInput.value.trim().length > 1) {
      debouncedSuggest(dom.searchInput.value.trim());
    }
  });

  // Search button
  dom.searchBtn.addEventListener("click", () => {
    performSearch(dom.searchInput.value.trim());
  });

  // Clear button
  dom.searchClear.addEventListener("click", () => {
    dom.searchInput.value = "";
    dom.searchClear.style.display = "none";
    hideSuggestions();
    dom.searchInput.focus();
  });

  // Click outside suggestions
  document.addEventListener("click", (e) => {
    if (!dom.searchBox.contains(e.target)) hideSuggestions();
  });

  // Quick tags
  dom.quickTags.addEventListener("click", (e) => {
    const tag = e.target.closest(".quick-tag");
    if (tag) performSearch(tag.dataset.q);
  });

  // Nav buttons
  dom.navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab === "search") {
        showView("home");
        dom.searchInput.focus();
      } else if (tab === "hot") {
        showView("hot");
      }
    });
  });

  // Breadcrumb home
  dom.breadcrumbHome.addEventListener("click", () => {
    showView("home");
  });

  // Keyboard shortcut: / to focus search
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      e.preventDefault();
      dom.searchInput.focus();
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────

function init() {
  bindEvents();
  renderHotCars();
  checkApiHealth();
  showView("home");

  // Auto-focus search on load
  setTimeout(() => dom.searchInput.focus(), 300);

  console.log("🚗 iCar initialized");
}

// Start
document.addEventListener("DOMContentLoaded", init);
