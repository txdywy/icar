/**
 * iCar API Worker
 *
 * Proxies requests to Chinese automotive data APIs (懂车帝 / dongchedi).
 * Handles CORS, caches aggressively, and computes 落地价 (on-road price).
 *
 * Endpoints:
 *   GET /api/search?q=keyword
 *   GET /api/series/:id
 *   GET /api/config/:id
 */

const DCD_BASE = "https://www.dongchedi.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const DCD_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
  Referer: "https://www.dongchedi.com/",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

// ── helpers ──────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function cors() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function dcdFetch(path, ttl = 300) {
  const url = `${DCD_BASE}${path}`;
  const resp = await fetch(url, { headers: DCD_HEADERS });
  if (!resp.ok) throw new Error(`DCD ${resp.status}: ${path}`);
  return resp.json();
}

// ── 落地价计算 ────────────────────────────────────────────────────────────

function calcOnRoadPrice(guidePrice, energyType) {
  const price = Number(guidePrice) || 0;
  if (price <= 0) return null;

  // 购置税：新能源免征，燃油车 ≈ 价格 ÷ 11.3
  const isNEV = /电动|插混|增程|混动|新能源|EV|PHEV|EREV/i.test(energyType || "");
  const purchaseTax = isNEV ? 0 : Math.round(price * 10000 / 11.3);

  // 交强险 950 + 商业险 ≈ 车价 × 4.5%
  const compulsoryInsurance = 950;
  const commercialInsurance = Math.round(price * 10000 * 0.045);

  // 上牌费 + 车船税
  const registrationFee = 500;
  const vesselTax = 360;

  const totalOnRoad =
    price * 10000 +
    purchaseTax +
    compulsoryInsurance +
    commercialInsurance +
    registrationFee +
    vesselTax;

  return {
    guidePrice: price,
    purchaseTax,
    compulsoryInsurance,
    commercialInsurance,
    registrationFee,
    vesselTax,
    totalOnRoad: Math.round(totalOnRoad),
    totalOnRoadDisplay: (totalOnRoad / 10000).toFixed(2) + "万",
    isNEV,
  };
}

// ── 数据归一化 ─────────────────────────────────────────────────────────────

function normalizeSearchResult(item) {
  return {
    seriesId: item.series_id || item.seriesId,
    seriesName: item.series_name || item.seriesName || item.name,
    brandName: item.brand_name || item.brandName || "",
    cover: item.cover || item.series_image || "",
    dealerPrice: item.dealer_price || item.dealerPrice || "",
    guidePrice: item.price || item.min_price || item.guidePrice || "",
    energyType: item.energy_type || item.energyType || "",
    year: item.year || "",
    tags: item.tags || [],
  };
}

function normalizeSeriesDetail(data) {
  const info = data || {};
  return {
    seriesId: info.series_id || info.id,
    seriesName: info.series_name || info.name,
    brandName: info.brand_name || info.brand || "",
    cover: info.cover || info.image || "",
    dealerPrice: info.dealer_price || "",
    guidePrice: info.price || "",
    minPrice: info.min_price || "",
    maxPrice: info.max_price || "",
    energyType: info.energy_type || "",
    year: info.year || "",
    saleStatus: info.sale_status || "",
    outPrice: info.out_price_desc || "",
    tags: info.tags || [],
  };
}

function normalizeConfigItem(item) {
  return {
    carId: item.car_id || item.id,
    carName: item.car_name || item.name,
    year: item.year || "",
    guidePrice: item.price || item.guide_price || "",
    energyType: item.energy_type || "",
    enginePower: item.engine_power || item.max_power || "",
    engineTorque: item.engine_torque || item.max_torque || "",
    transmission: item.gear_type || item.transmission || "",
    bodyDimensions: item.body_dimensions || "",
    wheelbase: item.wheelbase || "",
    fuelType: item.fuel_type || "",
    fuelConsumption: item.oil_wear || item.fuel_consumption || "",
    seats: item.seat_num || item.seats || "",
    zeroToHundred: item.zero_to_hundred || "",
    maxSpeed: item.max_speed || "",
    trunkVolume: item.trunk_volume || "",
    curbWeight: item.kerb_weight || "",
    driveType: item.drive_type || "",
  };
}

// ── route handlers ────────────────────────────────────────────────────────

async function handleSearch(q) {
  if (!q) return json({ error: "missing query parameter q" }, 400);

  try {
    const data = await dcdFetch(
      `/motor/pc/car/series/search?keyword=${encodeURIComponent(q)}&count=20`
    );

    const results = (data.data?.list || data.data || []).map(normalizeSearchResult);
    return json({ ok: true, query: q, results });
  } catch (err) {
    // Fallback: try the v3 search API
    try {
      const data = await dcdFetch(
        `/motor/pc/car/v3/search?keyword=${encodeURIComponent(q)}`
      );
      const raw = data.data?.series_list || data.data?.list || data.data || [];
      const results = raw.map(normalizeSearchResult);
      return json({ ok: true, query: q, results, source: "v3" });
    } catch {
      return json({ ok: false, error: err.message }, 502);
    }
  }
}

async function handleSeries(seriesId) {
  if (!seriesId) return json({ error: "missing series id" }, 400);

  try {
    const data = await dcdFetch(
      `/motor/pc/car/series/series_id?series_id=${seriesId}`
    );
    const detail = normalizeSeriesDetail(data.data);

    // Compute on-road price
    if (detail.guidePrice) {
      detail.onRoad = calcOnRoadPrice(
        parseFloat(detail.guidePrice),
        detail.energyType
      );
    }

    return json({ ok: true, detail });
  } catch (err) {
    return json({ ok: false, error: err.message }, 502);
  }
}

async function handleConfig(seriesId) {
  if (!seriesId) return json({ error: "missing series id" }, 400);

  try {
    const data = await dcdFetch(
      `/motor/pc/car/config/series?series_id=${seriesId}`
    );
    const configs = (data.data?.list || data.data || []).map(normalizeConfigItem);

    // Add on-road price for each config
    for (const cfg of configs) {
      if (cfg.guidePrice) {
        cfg.onRoad = calcOnRoadPrice(
          parseFloat(cfg.guidePrice),
          cfg.energyType
        );
      }
    }

    return json({ ok: true, seriesId, configs });
  } catch (err) {
    return json({ ok: false, error: err.message }, 502);
  }
}

async function handleCarInfo(carId) {
  if (!carId) return json({ error: "missing car id" }, 400);

  try {
    const data = await dcdFetch(
      `/motor/pc/car/info?car_id=${carId}`
    );
    const info = normalizeConfigItem(data.data || {});

    if (info.guidePrice) {
      info.onRoad = calcOnRoadPrice(
        parseFloat(info.guidePrice),
        info.energyType
      );
    }

    return json({ ok: true, car: info });
  } catch (err) {
    return json({ ok: false, error: err.message }, 502);
  }
}

// ── router ────────────────────────────────────────────────────────────────

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === "OPTIONS") return cors();

    const url = new URL(request.url);
    const { pathname } = url;

    // Health check
    if (pathname === "/api/health") {
      return json({ ok: true, ts: Date.now() });
    }

    // Search: /api/search?q=xxx
    if (pathname === "/api/search") {
      return handleSearch(url.searchParams.get("q"));
    }

    // Series detail: /api/series/{id}
    const seriesMatch = pathname.match(/^\/api\/series\/(\d+)/);
    if (seriesMatch) return handleSeries(seriesMatch[1]);

    // Config: /api/config/{id}
    const configMatch = pathname.match(/^\/api\/config\/(\d+)/);
    if (configMatch) return handleConfig(configMatch[1]);

    // Car info: /api/car/{id}
    const carMatch = pathname.match(/^\/api\/car\/(\d+)/);
    if (carMatch) return handleCarInfo(carMatch[1]);

    return json({ error: "not found", endpoints: ["/api/search", "/api/series/:id", "/api/config/:id", "/api/car/:id"] }, 404);
  },
};
