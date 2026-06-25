/**
 * iCar API Worker — powered by Firecrawl
 *
 * Uses Firecrawl to scrape dongchedi.com (懂车帝) for car data.
 * Handles CORS, caching, and on-road price calculation.
 *
 * Required env var:
 *   FIRECRAWL_API_KEY — Firecrawl API key
 */

// ── CORS helpers ────────────────────────────────────────────────────────

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

// ── Firecrawl fetcher ───────────────────────────────────────────────────

async function firecrawlScrape(url, apiKey) {
  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      waitFor: 2000,
    }),
  });
  if (!resp.ok) throw new Error(`Firecrawl scrape ${resp.status}`);
  const data = await resp.json();
  if (!data.success) throw new Error(data.error || "Firecrawl scrape failed");
  return data.data;
}

async function firecrawlSearch(query, apiKey, limit = 8) {
  const resp = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: `${query} 懂车帝 报价 参数`,
      limit,
      scrapeOptions: { formats: ["markdown"] },
    }),
  });
  if (!resp.ok) throw new Error(`Firecrawl search ${resp.status}`);
  const data = await resp.json();
  if (!data.success) throw new Error(data.error || "Firecrawl search failed");
  return data.data;
}

// ── 落地价计算 ────────────────────────────────────────────────────────────

function calcOnRoadPrice(priceWan, energyType) {
  const price = Number(priceWan) || 0;
  if (price <= 0) return null;

  const isNEV = /电动|插混|增程|混动|新能源|EV|PHEV|EREV/i.test(energyType || "");
  const purchaseTax = isNEV ? 0 : Math.round((price * 10000) / 11.3);
  const compulsoryInsurance = 950;
  const commercialInsurance = Math.round(price * 10000 * 0.045);
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

// ── Image extraction ────────────────────────────────────────────────────

function extractCoverImage(md) {
  // Find the main car image — typically the first image after the H1 title
  // dongchedi uses: ![SeriesName](https://p*.dcd.byteimg.com/img/motor-mis-img/...)
  const allImgs = [...md.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g)];

  for (const m of allImgs) {
    const alt = m[1];
    const url = m[2];
    // Skip SVG placeholders, icons, logos, avatars, QR codes
    if (url.includes("svg+xml")) continue;
    if (url.includes("logo")) continue;
    if (url.includes("passport")) continue;
    if (url.includes("gongan")) continue;
    if (url.includes("dcd-code")) continue;
    if (url.includes("play-")) continue;
    if (url.includes("360-")) continue;
    if (url.includes("empty-envelope")) continue;
    if (url.includes("dealer_")) continue;
    if (url.includes("~80x0.image")) continue;
    // The main cover usually has motor-mis-img or is after the H1
    if (url.includes("motor-mis-img") || url.includes("tplv-resize:100:100")) {
      // Upgrade to larger size
      return url.replace("tplv-resize:100:100", "tplv-resize:400:400");
    }
  }

  // Fallback: first non-placeholder image
  for (const m of allImgs) {
    const url = m[2];
    if (!url.includes("svg+xml") && !url.includes("passport") && !url.includes("logo")) {
      return url;
    }
  }

  return "";
}

function extractGalleryImages(md) {
  const allImgs = [...md.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g)];
  const gallery = [];
  const seen = new Set();

  for (const m of allImgs) {
    const url = m[2];
    // Only include actual car photos (motor-img domain, high-res)
    if (!url.includes("dcd-sign.byteimg.com/motor-img/")) continue;
    if (url.includes("svg+xml")) continue;
    // Dedup by base URL (before ?params)
    const base = url.split("?")[0];
    if (seen.has(base)) continue;
    seen.add(base);
    gallery.push(url);
    if (gallery.length >= 8) break;
  }

  return gallery;
}

// ── Markdown parsers ────────────────────────────────────────────────────

function extractSeriesFromUrl(url) {
  const m = url.match(/\/auto\/series\/(\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

function parseSearchResults(searchData) {
  const results = [];
  const items = Array.isArray(searchData) ? searchData : (searchData.web || []);

  for (const item of items) {
    const url = item.url || "";
    const seriesId = extractSeriesFromUrl(url);
    if (!seriesId) continue;

    const md = item.markdown || "";
    const title = item.title || "";

    let seriesName = "";
    const nameMatch = title.match(/【(.+?)】/);
    if (nameMatch) seriesName = nameMatch[1];
    else seriesName = title.split(/[-_]/)[0].trim();

    let brandName = "";
    const brandMatch = title.match(/】(.+?)_/);
    if (brandMatch) brandName = brandMatch[1];

    let guidePrice = "";
    const priceMatch = md.match(/指导价[：:]\s*([\d.]+-[\d.]+万|[\d.]+万)/);
    if (priceMatch) guidePrice = priceMatch[1].replace("万", "");
    else {
      const priceMatch2 = md.match(/([\d.]+-[\d.]+)万/);
      if (priceMatch2) guidePrice = priceMatch2[1];
    }

    let dealerPrice = "";
    const dpMatch = md.match(/经销商报价\s*([\d.]+-[\d.]+万|[\d.]+万)/);
    if (dpMatch) dealerPrice = dpMatch[1].replace("万", "");

    const cover = extractCoverImage(md);

    let energyType = "";
    if (/纯电|EV|电动/i.test(md)) energyType = "纯电动";
    else if (/插混|PHEV/i.test(md)) energyType = "插电混动";
    else if (/增程/i.test(md)) energyType = "增程";
    else if (/混动|HEV/i.test(md)) energyType = "混动";

    results.push({
      seriesId,
      seriesName,
      brandName,
      cover,
      guidePrice,
      dealerPrice,
      energyType,
      url,
    });
  }

  // Dedup by seriesId
  const deduped = new Map();
  for (const r of results) {
    if (!deduped.has(r.seriesId)) deduped.set(r.seriesId, r);
  }
  return [...deduped.values()];
}

function parseSeriesDetail(scrapeData) {
  const md = scrapeData.markdown || "";
  const meta = scrapeData.metadata || {};

  const title = meta.title || "";
  let seriesName = "";
  const nameMatch = title.match(/【(.+?)】/);
  if (nameMatch) seriesName = nameMatch[1];

  let brandName = "";
  const brandMatch = title.match(/】(.+?)_/);
  if (brandMatch) brandName = brandMatch[1];

  let carType = "";
  const typeMatch = md.match(/# .+\n\n([^\n]+)/);
  if (typeMatch) carType = typeMatch[1].trim();

  let energyType = "";
  if (/纯电/i.test(carType) || /纯电/i.test(md)) energyType = "纯电动";
  else if (/插混|PHEV/i.test(md)) energyType = "插电混动";
  else if (/增程/i.test(md)) energyType = "增程";
  else if (/混动/i.test(md)) energyType = "混动";
  else energyType = "燃油";

  let guidePrice = "";
  const gpMatch = md.match(/厂商指导价\s*([\d.]+-[\d.]+万|[\d.]+万)/);
  if (gpMatch) guidePrice = gpMatch[1].replace("万", "");
  else {
    const gpMatch2 = md.match(/指导价[：:]\s*([\d.]+-[\d.]+万|[\d.]+万)/);
    if (gpMatch2) guidePrice = gpMatch2[1].replace("万", "");
  }

  let dealerPrice = "";
  const dpMatch = md.match(/经销商报价\s*([\d.]+-[\d.]+万|[\d.]+万)/);
  if (dpMatch) dealerPrice = dpMatch[1].replace("万", "");

  const cover = extractCoverImage(md);
  const gallery = extractGalleryImages(md);
  const models = parseModelList(md);

  return {
    seriesName,
    brandName,
    carType,
    energyType,
    guidePrice,
    dealerPrice,
    cover,
    gallery,
    models,
  };
}

function parseModelList(md) {
  const models = [];
  const modelSection = md.split("车型列表")[1] || md;
  const lines = modelSection.split("\n");

  let currentModel = null;
  for (const line of lines) {
    const nameMatch = line.match(/\[(\d{4}款[^[\]]+)\]\(/);
    if (nameMatch) {
      if (currentModel) models.push(currentModel);
      currentModel = {
        name: nameMatch[1].trim(),
        guidePrice: "",
        dealerPrice: "",
      };
      continue;
    }

    if (currentModel) {
      const priceMatch = line.match(/^[\s]*([\d.]+)万[\s]*$/);
      if (priceMatch) {
        if (!currentModel.guidePrice) {
          currentModel.guidePrice = priceMatch[1];
        } else if (!currentModel.dealerPrice) {
          currentModel.dealerPrice = priceMatch[1];
        }
      }
    }
  }
  if (currentModel) models.push(currentModel);

  if (models.length === 0) {
    const altMatches = md.matchAll(
      /\[(\d{4}款[^\]]+)\][\s\S]*?([\d.]+)万[\s\S]*?([\d.]+)万/g
    );
    for (const m of altMatches) {
      models.push({
        name: m[1].trim(),
        guidePrice: m[2],
        dealerPrice: m[3],
      });
    }
  }

  return models;
}

// ── Route handlers ───────────────────────────────────────────────────────

async function handleSearch(q, apiKey) {
  if (!q) return json({ error: "missing query parameter q" }, 400);

  try {
    const searchData = await firecrawlSearch(`懂车帝 ${q} 价格`, apiKey);
    const results = parseSearchResults(searchData);
    return json({ ok: true, query: q, results });
  } catch (err) {
    return json({ ok: false, error: err.message }, 502);
  }
}

async function handleSeries(seriesId, apiKey) {
  if (!seriesId) return json({ error: "missing series id" }, 400);

  try {
    const url = `https://www.dongchedi.com/auto/series/${seriesId}`;
    const scrapeData = await firecrawlScrape(url, apiKey);
    const detail = parseSeriesDetail(scrapeData);

    if (detail.guidePrice) {
      const minPrice = parseFloat(detail.guidePrice.split("-")[0]);
      detail.onRoad = calcOnRoadPrice(minPrice, detail.energyType);
    }

    for (const model of detail.models) {
      if (model.guidePrice) {
        model.onRoad = calcOnRoadPrice(parseFloat(model.guidePrice), detail.energyType);
      }
    }

    return json({ ok: true, detail });
  } catch (err) {
    return json({ ok: false, error: err.message }, 502);
  }
}

// ── Router ───────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors();

    const apiKey = env.FIRECRAWL_API_KEY;
    if (!apiKey) return json({ error: "FIRECRAWL_API_KEY not configured" }, 500);

    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/api/health") return json({ ok: true, ts: Date.now() });
    if (pathname === "/api/search") return handleSearch(url.searchParams.get("q"), apiKey);

    const seriesMatch = pathname.match(/^\/api\/series\/(\d+)/);
    if (seriesMatch) return handleSeries(seriesMatch[1], apiKey);

    return json({ error: "not found" }, 404);
  },
};
