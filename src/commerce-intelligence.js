const DAY_MS = 86_400_000;

export function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

export function median(values = []) {
  const clean = values.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

export function normalizeText(value = '') {
  return String(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function productSearchText(product = {}) {
  const specs = product.specs && typeof product.specs === 'object'
    ? Object.entries(product.specs).flatMap(([key, value]) => [key, value])
    : [];
  return normalizeText([
    product.name, product.brand, product.sku, product.description,
    ...(product.tags || []), ...(product.compatibilityTags || []), ...specs
  ].join(' '));
}

export function productMap(db) {
  return new Map((db.products || []).map((item) => [item.id, item]));
}

export function storeMap(db) {
  return new Map((db.stores || []).map((item) => [item.id, item]));
}

export function activeOffers(db, productId) {
  return (db.offers || [])
    .filter((offer) => offer.productId === productId && offer.active !== false && offer.qualityHold !== true)
    .filter((offer) => ['in_stock', 'low_stock', 'unknown'].includes(offer.stock || 'unknown'))
    .filter((offer) => num(offer.price, 0) > 0)
    .sort((a, b) => Number(a.price) - Number(b.price));
}

export function bestOffer(db, productId) {
  return activeOffers(db, productId)[0] || null;
}

export function historyForProduct(db, productId, days = 365) {
  const cutoff = Date.now() - days * DAY_MS;
  return (db.priceHistory || [])
    .filter((entry) => entry.productId === productId && Date.parse(entry.capturedAt || '') >= cutoff)
    .map((entry) => ({ ...entry, price: num(entry.price) }))
    .filter((entry) => entry.price && entry.price > 0)
    .sort((a, b) => Date.parse(a.capturedAt || '') - Date.parse(b.capturedAt || ''));
}

export function dailyMinimums(entries = []) {
  const days = new Map();
  for (const entry of entries) {
    const timestamp = Date.parse(entry.capturedAt || '');
    if (!Number.isFinite(timestamp)) continue;
    const key = new Date(timestamp).toISOString().slice(0, 10);
    const current = days.get(key);
    if (!current || entry.price < current.price) days.set(key, entry);
  }
  return [...days.entries()].map(([date, entry]) => ({ date, price: entry.price, storeId: entry.storeId }));
}

function regression(points) {
  if (points.length < 3) return null;
  const xs = points.map((_, index) => index);
  const ys = points.map((point) => point.price);
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < xs.length; i += 1) {
    numerator += (xs[i] - xMean) * (ys[i] - yMean);
    denominator += (xs[i] - xMean) ** 2;
  }
  if (!denominator) return null;
  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  const residuals = ys.map((y, i) => y - (intercept + slope * xs[i]));
  const variance = residuals.reduce((sum, value) => sum + value ** 2, 0) / Math.max(1, residuals.length - 2);
  return { slope, intercept, stdError: Math.sqrt(variance), mean: yMean };
}

export function priceIntelligence(db, productId) {
  const product = (db.products || []).find((item) => item.id === productId);
  if (!product) return null;
  const offer = bestOffer(db, productId);
  const current = num(offer?.price);
  const history90 = dailyMinimums(historyForProduct(db, productId, 90));
  const history30 = history90.filter((point) => Date.parse(point.date) >= Date.now() - 30 * DAY_MS);
  const prices90 = history90.map((point) => point.price);
  const prices30 = history30.map((point) => point.price);
  if (current) {
    prices90.push(current);
    prices30.push(current);
  }
  const average30 = prices30.length ? prices30.reduce((a, b) => a + b, 0) / prices30.length : current;
  const median30 = median(prices30);
  const low90 = prices90.length ? Math.min(...prices90) : current;
  const high90 = prices90.length ? Math.max(...prices90) : current;
  const discountVs30 = current && average30 ? ((average30 - current) / average30) * 100 : 0;
  const range = high90 && low90 ? Math.max(1, high90 - low90) : 1;
  const position = current && high90 ? (high90 - current) / range : 0.5;
  const realDiscount = discountVs30 >= 5 && current <= (median30 || current);
  const reg = regression(history30.slice(-30));
  const next7 = reg && current
    ? Math.max(0, current + reg.slope * Math.min(7, Math.max(1, history30.length / 7)))
    : current;
  const volatility = prices30.length > 2 && average30
    ? Math.sqrt(prices30.reduce((sum, price) => sum + (price - average30) ** 2, 0) / prices30.length) / average30
    : 0;
  const predictionConfidence = Math.max(0, Math.min(0.9, (history30.length / 20) * (1 - Math.min(0.8, volatility))));

  let buyScore = Math.round(Math.max(0, Math.min(100, 45 + position * 40 + Math.max(-20, Math.min(20, discountVs30)))));
  if (current && low90 && current <= low90 * 1.02) buyScore = Math.max(buyScore, 90);
  const predictedDelta = current && next7 ? ((next7 - current) / current) * 100 : 0;
  let action = 'BEKLE';
  if (buyScore >= 75 && predictedDelta > -3) action = 'AL';
  else if (buyScore < 40 || predictedDelta < -4) action = 'PAHALI';

  return {
    productId,
    currentPrice: current,
    average30: round(average30),
    median30: round(median30),
    low90: round(low90),
    high90: round(high90),
    discountVs30Pct: round(discountVs30, 1),
    realDiscount,
    buyScore,
    action,
    predicted7dPrice: round(next7),
    predicted7dDeltaPct: round(predictedDelta, 1),
    predictionConfidence: round(predictionConfidence, 2),
    volatilityPct: round(volatility * 100, 1),
    historyPoints: history90.length
  };
}

export function purchaseTiming(db, productId) {
  const points = dailyMinimums(historyForProduct(db, productId, 365));
  const weekday = Array.from({ length: 7 }, () => []);
  const monthPart = { early: [], mid: [], late: [] };
  for (const point of points) {
    const date = new Date(`${point.date}T12:00:00Z`);
    weekday[date.getUTCDay()].push(point.price);
    const day = date.getUTCDate();
    monthPart[day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late'].push(point.price);
  }
  const weekdayMedians = weekday.map((values, index) => ({ weekday: index, medianPrice: round(median(values)), samples: values.length }));
  const usable = weekdayMedians.filter((row) => row.medianPrice && row.samples >= 2).sort((a, b) => a.medianPrice - b.medianPrice);
  const parts = Object.entries(monthPart)
    .map(([part, values]) => ({ part, medianPrice: round(median(values)), samples: values.length }))
    .filter((row) => row.medianPrice && row.samples >= 2)
    .sort((a, b) => a.medianPrice - b.medianPrice);
  return {
    bestWeekday: usable[0] || null,
    bestMonthPart: parts[0] || null,
    weekdayMedians,
    monthParts: parts,
    samples: points.length
  };
}

export function storeTrustScores(db) {
  const now = Date.now();
  const reports = db.reports || [];
  const flags = db.qualityFlags || [];
  return (db.stores || []).filter((store) => store.active !== false).map((store) => {
    const offers = (db.offers || []).filter((offer) => offer.storeId === store.id);
    const active = offers.filter((offer) => offer.active !== false);
    const verified = active.filter((offer) => {
      const ts = Date.parse(offer.verifiedAt || offer.updatedAt || '');
      return Number.isFinite(ts) && now - ts <= 48 * 60 * 60 * 1000;
    }).length;
    const unknownStock = active.filter((offer) => (offer.stock || 'unknown') === 'unknown').length;
    const reportCount = reports.filter((report) => report.status === 'open' && offers.some((offer) => offer.id === report.offerId)).length;
    const flagCount = flags.filter((flag) => flag.status === 'open' && flag.storeId === store.id).length;
    const freshness = active.length ? verified / active.length : 0.5;
    const stockQuality = active.length ? 1 - unknownStock / active.length : 0.5;
    const penalty = Math.min(0.35, reportCount * 0.04 + flagCount * 0.05);
    const score = Math.round(Math.max(0, Math.min(100, 45 + freshness * 35 + stockQuality * 20 - penalty * 100)));
    const deliveryMin = num(store.deliveryDaysMin, null);
    const deliveryMax = num(store.deliveryDaysMax, null);
    return {
      id: store.id,
      name: store.name,
      score,
      activeOffers: active.length,
      freshnessPct: Math.round(freshness * 100),
      stockKnownPct: Math.round(stockQuality * 100),
      openReports: reportCount,
      openQualityFlags: flagCount,
      deliveryDays: deliveryMin && deliveryMax ? `${deliveryMin}-${deliveryMax}` : deliveryMin ? String(deliveryMin) : null,
      freeShippingThreshold: num(store.freeShippingThreshold, null),
      shippingBase: num(store.shippingBase, null)
    };
  }).sort((a, b) => b.score - a.score);
}

export function recommendedOffers(db, productId, city = '') {
  const stores = storeMap(db);
  const trust = new Map(storeTrustScores(db).map((item) => [item.id, item]));
  const offers = activeOffers(db, productId);
  if (!offers.length) return [];
  const cheapest = Number(offers[0].price);
  return offers.map((offer) => {
    const store = stores.get(offer.storeId) || {};
    const storeTrust = trust.get(offer.storeId)?.score || 50;
    const pricePenalty = cheapest > 0 ? Math.min(40, ((Number(offer.price) - cheapest) / cheapest) * 100) : 0;
    const verifiedAt = Date.parse(offer.verifiedAt || offer.updatedAt || '');
    const ageHours = Number.isFinite(verifiedAt) ? (Date.now() - verifiedAt) / 3_600_000 : 72;
    const freshness = Math.max(0, 20 - Math.min(20, ageHours / 3));
    const stockBonus = offer.stock === 'in_stock' ? 10 : offer.stock === 'low_stock' ? 5 : 0;
    const cityEstimate = city && store.deliveryByCity?.[city] ? store.deliveryByCity[city] : null;
    const score = Math.round(Math.max(0, Math.min(100, 55 + storeTrust * 0.25 + freshness + stockBonus - pricePenalty)));
    return {
      offerId: offer.id,
      storeId: offer.storeId,
      storeName: store.name || '',
      price: Number(offer.price),
      stock: offer.stock,
      verifiedAt: offer.verifiedAt || offer.updatedAt || null,
      confidence: num(offer.geminiConfidence, null),
      sponsored: offer.sponsored === true,
      score,
      cityDelivery: cityEstimate,
      url: offer.url
    };
  }).sort((a, b) => b.score - a.score || a.price - b.price);
}

function shippingForStore(store, subtotal) {
  const base = num(store?.shippingBase, 0);
  const threshold = num(store?.freeShippingThreshold, null);
  if (threshold && subtotal >= threshold) return 0;
  return Math.max(0, base || 0);
}

export function optimizeBasket(db, inputItems = [], city = '') {
  const products = productMap(db);
  const stores = storeMap(db);
  const items = inputItems
    .map((item) => ({ productId: String(item.productId || ''), qty: Math.max(1, Math.min(99, Math.round(num(item.qty, 1)))) }))
    .filter((item) => products.has(item.productId))
    .slice(0, 30);
  const missing = [];
  const cheapestLines = [];
  for (const item of items) {
    const offers = activeOffers(db, item.productId);
    if (!offers.length) {
      missing.push({ productId: item.productId, name: products.get(item.productId)?.name || '', qty: item.qty });
      continue;
    }
    const offer = offers[0];
    cheapestLines.push({ ...item, offer, product: products.get(item.productId) });
  }
  const grouped = new Map();
  for (const line of cheapestLines) {
    const key = line.offer.storeId;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(line);
  }
  const splitStores = [...grouped.entries()].map(([storeId, lines]) => {
    const store = stores.get(storeId) || {};
    const subtotal = lines.reduce((sum, line) => sum + Number(line.offer.price) * line.qty, 0);
    const shipping = shippingForStore(store, subtotal);
    return {
      storeId, storeName: store.name || '', subtotal: round(subtotal), shipping: round(shipping), total: round(subtotal + shipping),
      cityDelivery: city && store.deliveryByCity?.[city] ? store.deliveryByCity[city] : null,
      lines: lines.map((line) => ({ productId: line.productId, name: line.product.name, qty: line.qty, unitPrice: Number(line.offer.price), offerId: line.offer.id }))
    };
  });
  const splitTotal = splitStores.reduce((sum, group) => sum + Number(group.total), 0);

  const candidateStores = new Set((db.offers || []).filter((offer) => offer.active !== false).map((offer) => offer.storeId));
  const singleStoreOptions = [];
  for (const storeId of candidateStores) {
    const lines = [];
    let complete = true;
    for (const item of items) {
      const offer = activeOffers(db, item.productId).find((candidate) => candidate.storeId === storeId);
      if (!offer) { complete = false; break; }
      lines.push({ item, offer, product: products.get(item.productId) });
    }
    if (!complete || !lines.length) continue;
    const store = stores.get(storeId) || {};
    const subtotal = lines.reduce((sum, line) => sum + Number(line.offer.price) * line.item.qty, 0);
    const shipping = shippingForStore(store, subtotal);
    singleStoreOptions.push({
      storeId, storeName: store.name || '', subtotal: round(subtotal), shipping: round(shipping), total: round(subtotal + shipping),
      cityDelivery: city && store.deliveryByCity?.[city] ? store.deliveryByCity[city] : null,
      lines: lines.map((line) => ({ productId: line.item.productId, name: line.product.name, qty: line.item.qty, unitPrice: Number(line.offer.price), offerId: line.offer.id }))
    });
  }
  singleStoreOptions.sort((a, b) => a.total - b.total);
  const bestSingle = singleStoreOptions[0] || null;
  const split = { stores: splitStores, total: round(splitTotal) };
  const recommended = bestSingle && bestSingle.total <= split.total * 1.03 ? 'single_store' : 'split';
  return {
    items: items.length,
    missing,
    split,
    bestSingle,
    alternatives: singleStoreOptions.slice(0, 5),
    recommended,
    savingsVsSingle: bestSingle ? round(Math.max(0, bestSingle.total - split.total)) : null,
    shippingIsEstimate: true
  };
}

export function searchProducts(db, query, limit = 8) {
  const needle = normalizeText(query);
  if (!needle) return [];
  const words = needle.split(/\s+/).filter(Boolean);
  return (db.products || [])
    .filter((product) => product.active !== false)
    .map((product) => {
      const text = productSearchText(product);
      const hits = words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
      const offer = bestOffer(db, product.id);
      return { product, hits, price: num(offer?.price) };
    })
    .filter((entry) => entry.hits > 0 && entry.price)
    .sort((a, b) => b.hits - a.hits || a.price - b.price)
    .slice(0, limit)
    .map(({ product, price }) => ({ id: product.id, name: product.name, brand: product.brand || '', sku: product.sku || '', price }));
}

export function resolveBom(db, rows = []) {
  const resolved = [];
  const unresolved = [];
  for (const row of rows.slice(0, 100)) {
    const query = String(row.query || row.name || row.sku || '').trim();
    const qty = Math.max(1, Math.min(999, Math.round(num(row.qty || row.quantity, 1))));
    if (!query) continue;
    const matches = searchProducts(db, query, 5);
    if (!matches.length) unresolved.push({ query, qty });
    else resolved.push({ query, qty, selected: matches[0], alternatives: matches.slice(1) });
  }
  return { resolved, unresolved };
}

export function projectCost(db, template, city = '') {
  const result = resolveBom(db, template?.items || []);
  const items = result.resolved.map((row) => ({ productId: row.selected.id, qty: row.qty }));
  const basket = optimizeBasket(db, items, city);
  return { template, ...result, basket };
}

export function alternativesForProduct(db, productId, limit = 6) {
  const product = (db.products || []).find((item) => item.id === productId);
  if (!product) return [];
  const sourceText = new Set(normalizeText([...(product.tags || []), ...(product.compatibilityTags || [])].join(' ')).split(/\s+/).filter(Boolean));
  const sourceOffer = bestOffer(db, productId);
  const sourcePrice = num(sourceOffer?.price, 0);
  return (db.products || [])
    .filter((candidate) => candidate.id !== productId && candidate.active !== false)
    .filter((candidate) => candidate.categoryId === product.categoryId || candidate.brand === product.brand)
    .map((candidate) => {
      const offer = bestOffer(db, candidate.id);
      if (!offer) return null;
      const words = normalizeText([...(candidate.tags || []), ...(candidate.compatibilityTags || [])].join(' ')).split(/\s+/);
      const overlap = words.filter((word) => sourceText.has(word)).length;
      const priceSimilarity = sourcePrice ? Math.max(0, 1 - Math.abs(Number(offer.price) - sourcePrice) / sourcePrice) : 0;
      return { id: candidate.id, name: candidate.name, price: Number(offer.price), overlap, score: round(overlap * 10 + priceSimilarity * 20, 1) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.price - b.price)
    .slice(0, limit);
}

function voltageRange(product) {
  const specs = product?.specs || {};
  const text = normalizeText([specs.voltage, specs.logicVoltage, specs.operatingVoltage, product?.description, ...(product?.tags || [])].join(' '));
  const values = [...String(text).matchAll(/(\d+(?:\.\d+)?)\s*v/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
}

export function compatibility(db, productIds = []) {
  const products = productMap(db);
  const selected = productIds.map((idValue) => products.get(idValue)).filter(Boolean).slice(0, 12);
  const issues = [];
  const notes = [];
  for (let i = 0; i < selected.length; i += 1) {
    for (let j = i + 1; j < selected.length; j += 1) {
      const a = selected[i];
      const b = selected[j];
      const aText = productSearchText(a);
      const bText = productSearchText(b);
      const aV = voltageRange(a);
      const bV = voltageRange(b);
      if ((aText.includes('esp32') || aText.includes('esp8266')) && bV?.max >= 5 && !bText.includes('3 3')) {
        issues.push({ severity: 'warning', products: [a.id, b.id], message: `${a.name} 3.3V lojik kullanabilir; ${b.name} için seviye dönüştürücü gerekip gerekmediğini kontrol et.` });
      }
      if ((bText.includes('esp32') || bText.includes('esp8266')) && aV?.max >= 5 && !aText.includes('3 3')) {
        issues.push({ severity: 'warning', products: [a.id, b.id], message: `${b.name} 3.3V lojik kullanabilir; ${a.name} için seviye dönüştürücü gerekip gerekmediğini kontrol et.` });
      }
      if ((aText.includes('motor') && !bText.includes('driver') && !bText.includes('surucu')) || (bText.includes('motor') && !aText.includes('driver') && !aText.includes('surucu'))) {
        notes.push('DC/step motorları mikrodenetleyici pininden doğrudan sürmek yerine uygun motor sürücüsü kullan.');
      }
    }
  }
  const hasController = selected.some((product) => /arduino|esp32|esp8266|raspberry|rp2040/.test(productSearchText(product)));
  const hasMotor = selected.some((product) => /motor|stepper|servo/.test(productSearchText(product)));
  const hasDriver = selected.some((product) => /driver|surucu|l298|a4988|drv8825/.test(productSearchText(product)));
  if (hasController && hasMotor && !hasDriver) issues.push({ severity: 'warning', products: selected.map((product) => product.id), message: 'Listede motor var ancak belirgin bir motor sürücü modülü görünmüyor.' });
  return { compatible: !issues.some((issue) => issue.severity === 'error'), issues, notes: [...new Set(notes)] };
}

export function accessoriesForProduct(db, productId) {
  const product = (db.products || []).find((item) => item.id === productId);
  if (!product) return [];
  const explicit = Array.isArray(product.accessoryProductIds) ? product.accessoryProductIds : [];
  const products = productMap(db);
  const result = explicit.map((idValue) => products.get(idValue)).filter(Boolean);
  if (result.length) return result.slice(0, 8).map((item) => ({ id: item.id, name: item.name, price: num(bestOffer(db, item.id)?.price) }));
  const text = productSearchText(product);
  const queries = [];
  if (/arduino|esp32|esp8266|rp2040/.test(text)) queries.push('usb kablo', 'jumper kablo', 'breadboard');
  if (/sensor|sensor|dht|hc sr/.test(text)) queries.push('jumper kablo', 'breadboard');
  if (/motor|stepper/.test(text)) queries.push('motor driver', 'guc kaynagi');
  const seen = new Set();
  for (const query of queries) {
    for (const item of searchProducts(db, query, 2)) if (!seen.has(item.id) && item.id !== productId) { seen.add(item.id); result.push(products.get(item.id)); }
  }
  return result.filter(Boolean).slice(0, 8).map((item) => ({ id: item.id, name: item.name, price: num(bestOffer(db, item.id)?.price) }));
}

export function technicalFilterMeta(db) {
  const values = new Map();
  for (const product of db.products || []) {
    if (product.active === false || !product.specs || typeof product.specs !== 'object') continue;
    for (const [key, value] of Object.entries(product.specs)) {
      if (value === null || value === undefined || String(value).length > 80) continue;
      if (!values.has(key)) values.set(key, new Set());
      values.get(key).add(String(value));
    }
  }
  return [...values.entries()].map(([key, set]) => ({ key, values: [...set].slice(0, 50) })).slice(0, 40);
}

export function categoryStats(db, days = 90) {
  const categories = new Map((db.categories || []).map((item) => [item.id, item]));
  const groups = new Map();
  for (const product of db.products || []) {
    if (product.active === false) continue;
    const insight = priceIntelligence(db, product.id);
    if (!insight?.currentPrice) continue;
    if (!groups.has(product.categoryId)) groups.set(product.categoryId, []);
    groups.get(product.categoryId).push(insight);
  }
  return [...groups.entries()].map(([categoryId, insights]) => {
    const currentAverage = insights.reduce((sum, item) => sum + item.currentPrice, 0) / insights.length;
    const historical = insights.map((item) => item.average30).filter(Boolean);
    const historicalAverage = historical.length ? historical.reduce((a, b) => a + b, 0) / historical.length : currentAverage;
    return {
      categoryId,
      name: categories.get(categoryId)?.name || 'Diğer',
      products: insights.length,
      averagePrice: round(currentAverage),
      changePct: historicalAverage ? round(((currentAverage - historicalAverage) / historicalAverage) * 100, 1) : 0,
      goodDeals: insights.filter((item) => item.realDiscount).length
    };
  }).sort((a, b) => b.products - a.products);
}

export function arduIndex(db) {
  const ratios = [];
  for (const product of db.products || []) {
    if (product.active === false) continue;
    const current = num(bestOffer(db, product.id)?.price);
    const history = dailyMinimums(historyForProduct(db, product.id, 90));
    const baseline = history.slice(0, Math.min(7, history.length)).map((item) => item.price);
    const base = median(baseline);
    if (current && base) ratios.push((current / base) * 100);
  }
  const index = median(ratios);
  return { value: round(index, 1), products: ratios.length, changeFromBasePct: index ? round(index - 100, 1) : null, base: 100 };
}

export function priceCalendar(db, productId) {
  const points = dailyMinimums(historyForProduct(db, productId, 365));
  const weekdayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({ weekday, name: weekdayNames[weekday], prices: [] }));
  const byMonthDay = new Map();
  for (const point of points) {
    const date = new Date(`${point.date}T12:00:00Z`);
    byWeekday[date.getUTCDay()].prices.push(point.price);
    const day = date.getUTCDate();
    if (!byMonthDay.has(day)) byMonthDay.set(day, []);
    byMonthDay.get(day).push(point.price);
  }
  return {
    weekdays: byWeekday.map((row) => ({ weekday: row.weekday, name: row.name, medianPrice: round(median(row.prices)), samples: row.prices.length })),
    monthDays: [...byMonthDay.entries()].map(([day, prices]) => ({ day, medianPrice: round(median(prices)), samples: prices.length })).sort((a, b) => a.day - b.day),
    samples: points.length
  };
}

export function globalComparison(db, productId, fx = {}) {
  const current = num(bestOffer(db, productId)?.price);
  const global = (db.globalOffers || []).filter((offer) => offer.productId === productId && offer.active !== false).map((offer) => {
    const currency = String(offer.currency || 'TRY').toUpperCase();
    const rate = currency === 'TRY' ? 1 : num(fx[currency], null);
    const baseTry = rate ? Number(offer.price) * rate : null;
    const shippingTry = rate ? num(offer.shipping, 0) * rate : null;
    const taxRate = Math.max(0, num(offer.estimatedTaxRate, 0));
    const landedTry = baseTry === null ? null : baseTry + (shippingTry || 0) + baseTry * taxRate;
    return { ...offer, currency, baseTry: round(baseTry), landedTry: round(landedTry), savingVsTurkey: current && landedTry ? round(current - landedTry) : null };
  }).sort((a, b) => (a.landedTry ?? Infinity) - (b.landedTry ?? Infinity));
  return { turkeyPrice: current, fx, offers: global };
}
