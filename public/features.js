const featureState = {
  dashboard: null,
  selected: new Set(),
  activeProductId: null,
  hubTab: 'deals',
  installPrompt: null,
  observerBusy: false
};

const f$ = (selector, root = document) => root.querySelector(selector);
const f$$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const token = () => localStorage.getItem('arduUserToken') || '';
const money = (value) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value || 0));

async function featureApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const userToken = token();
  if (userToken) headers.authorization = `Bearer ${userToken}`;
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const response = await fetch(path, { ...options, headers, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'İşlem başarısız.');
  return payload;
}

function featureToast(message) {
  const existing = f$('#toast');
  if (existing) {
    existing.textContent = message;
    existing.classList.add('show');
    clearTimeout(featureToast.timer);
    featureToast.timer = setTimeout(() => existing.classList.remove('show'), 2800);
    return;
  }
  console.log(message);
}

function productById(id) {
  return featureState.dashboard?.products?.find((product) => product.id === id) || null;
}

function relativeTime(value) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return 'kontrol zamanı yok';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

function trendClass(change) {
  if (change <= -1) return 'down';
  if (change >= 1) return 'up';
  return 'flat';
}

function trendText(change) {
  const number = Number(change || 0);
  if (number <= -0.1) return `↓ %${Math.abs(number).toLocaleString('tr-TR')}`;
  if (number >= 0.1) return `↑ %${number.toLocaleString('tr-TR')}`;
  return '→ Sabit';
}

async function loadFeatureDashboard({ quiet = false } = {}) {
  try {
    featureState.dashboard = await featureApi('/api/features/dashboard');
    renderFeatureHub();
    augmentAll();
    renderCompareBar();
    renderRouteMode();
  } catch (error) {
    if (!quiet) featureToast(error.message);
  }
}

function hubItems() {
  const data = featureState.dashboard;
  if (!data) return [];
  if (featureState.hubTab === 'drops') return data.drops || [];
  if (featureState.hubTab === 'favorites') {
    const favorites = new Set(data.favorites || []);
    return (data.products || []).filter((product) => favorites.has(product.id));
  }
  return data.deals || [];
}

function smartCard(product) {
  const insight = product.insight || {};
  const extra = featureState.hubTab === 'deals' && Number.isFinite(Number(product.discountPct))
    ? `<span class="smart-discount">Ortalamaya göre %${esc(product.discountPct)} ucuz</span>`
    : featureState.hubTab === 'drops' && Number.isFinite(Number(product.dropPct))
      ? `<span class="smart-discount">Son kayda göre %${esc(product.dropPct)} düştü</span>`
      : `<span class="smart-discount">${esc(insight.buyLabel || 'Fiyat takibi')}</span>`;
  return `
    <article class="smart-product" data-smart-product="${esc(product.id)}">
      <div class="smart-product-top">
        <span class="buy-score score-${insight.buyScore >= 80 ? 'good' : insight.buyScore >= 55 ? 'normal' : 'high'}">${esc(insight.buyScore || 50)}/100</span>
        ${extra}
      </div>
      <h3>${esc(product.name)}</h3>
      <p>${esc(product.brand || product.category?.name || 'Elektronik')}</p>
      <div class="smart-price-row"><strong>${money(product.bestPrice)}</strong><span class="trend ${trendClass(insight.changePct)}">${trendText(insight.changePct)}</span></div>
      <small>${esc(product.bestStore?.name || 'Mağaza')} • ${relativeTime(insight.verifiedAt)}</small>
      <div class="smart-actions">
        <button data-smart-open="${esc(product.id)}">İncele</button>
        <a href="/${esc(product.slug)}-fiyatlari">Fiyat sayfası ↗</a>
      </div>
    </article>`;
}

function renderFeatureHub() {
  if (!featureState.dashboard) return;
  let section = f$('#smartFeatures');
  if (!section) {
    section = document.createElement('section');
    section.id = 'smartFeatures';
    section.className = 'shell smart-section';
    const target = f$('#urunler');
    if (target) target.parentNode.insertBefore(section, target);
    else document.querySelector('main')?.appendChild(section);
  }

  const data = featureState.dashboard;
  const items = hubItems().slice(0, location.pathname === '/' ? 8 : 40);
  const titles = {
    deals: ['AKILLI FIRSATLAR', 'Geçmiş fiyatına göre avantajlı ürünler'],
    drops: ['FİYATI DÜŞENLER', 'Son kontrolde ucuzlayan ürünler'],
    favorites: ['TAKİP LİSTEM', 'Favori ürünlerin tek ekranda']
  };
  const [eyebrow, heading] = titles[featureState.hubTab];

  section.innerHTML = `
    <div class="section-head smart-head">
      <div><span class="eyebrow">${eyebrow}</span><h2>${heading}</h2><p class="smart-sub">Fiyat geçmişi, stok ve mağaza doğrulama verileri birlikte değerlendirilir.</p></div>
      <div class="smart-tabs">
        <button data-hub-tab="deals" class="${featureState.hubTab === 'deals' ? 'active' : ''}">Fırsatlar <b>${data.deals?.length || 0}</b></button>
        <button data-hub-tab="drops" class="${featureState.hubTab === 'drops' ? 'active' : ''}">Düşenler <b>${data.drops?.length || 0}</b></button>
        <button data-hub-tab="favorites" class="${featureState.hubTab === 'favorites' ? 'active' : ''}">Favoriler <b>${data.favorites?.length || 0}</b></button>
      </div>
    </div>
    <div class="smart-grid">${items.length ? items.map(smartCard).join('') : `<div class="smart-empty">${featureState.hubTab === 'favorites' && !data.user ? 'Favorilerini görmek için giriş yap.' : 'Bu bölüm için henüz yeterli fiyat geçmişi yok.'}</div>`}</div>
    <div class="smart-footer-links">
      <a href="/firsatlar">Tüm fırsatlar</a><a href="/fiyati-dusenler">Tüm fiyat düşüşleri</a><a href="/favoriler">Favorilerim</a><a href="/karsilastir">Karşılaştırma</a>
    </div>`;

  f$$('[data-hub-tab]', section).forEach((button) => button.addEventListener('click', () => {
    featureState.hubTab = button.dataset.hubTab;
    renderFeatureHub();
  }));
  f$$('[data-smart-open]', section).forEach((button) => button.addEventListener('click', () => openOriginalProduct(button.dataset.smartOpen)));
}

function openOriginalProduct(productId) {
  const card = f$(`[data-product="${CSS.escape(productId)}"]`);
  if (card) {
    featureState.activeProductId = productId;
    card.click();
    return;
  }
  const product = productById(productId);
  if (product) {
    const search = f$('#searchInput');
    if (search) {
      search.value = product.name;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        const next = f$(`[data-product="${CSS.escape(productId)}"]`);
        if (next) {
          featureState.activeProductId = productId;
          next.click();
        }
      }, 800);
    }
  }
}

function augmentProductCard(card) {
  if (!featureState.dashboard || card.dataset.featureReady === '1') return;
  const id = card.dataset.product;
  const product = productById(id);
  if (!product) return;
  card.dataset.featureReady = '1';
  const info = card.querySelector('.product-info');
  const badges = card.querySelector('.product-badges');
  const meta = card.querySelector('.card-meta');
  if (badges && !badges.querySelector('.feature-trend-badge')) {
    badges.insertAdjacentHTML('beforeend', `<span class="feature-trend-badge ${trendClass(product.insight.changePct)}">${trendText(product.insight.changePct)}</span>`);
  }
  if (meta) {
    meta.insertAdjacentHTML('beforeend', `<span class="feature-last-check">${relativeTime(product.insight.verifiedAt)}</span>`);
  }
  if (!info) return;
  const favorite = featureState.dashboard.favorites?.includes(id);
  info.insertAdjacentHTML('beforeend', `
    <div class="feature-card-tools">
      <button type="button" class="feature-icon-btn ${favorite ? 'active' : ''}" data-favorite="${esc(id)}" title="Favorilere ekle">${favorite ? '★' : '☆'} <span>Takip</span></button>
      <button type="button" class="feature-icon-btn ${featureState.selected.has(id) ? 'active' : ''}" data-compare="${esc(id)}" title="Karşılaştır">⇄ <span>Karşılaştır</span></button>
      <button type="button" class="feature-icon-btn" data-alert="${esc(id)}" title="Fiyat alarmı">🔔 <span>Alarm</span></button>
    </div>
    <div class="feature-buy-line"><b>${esc(product.insight.buyLabel)}</b><span>ArduFiyat skoru ${esc(product.insight.buyScore)}/100</span></div>`);
}

function augmentAll() {
  f$$('[data-product]').forEach(augmentProductCard);
  augmentStores();
  augmentPro();
}

function augmentStores() {
  if (!featureState.dashboard) return;
  f$$('.store-card').forEach((card) => {
    if (card.dataset.trustReady === '1') return;
    const name = card.querySelector('b')?.textContent?.trim();
    const trust = featureState.dashboard.stores?.find((store) => store.name === name);
    if (!trust) return;
    card.dataset.trustReady = '1';
    const div = card.querySelector('div');
    div?.insertAdjacentHTML('beforeend', `<small class="store-trust">Güven ${trust.score}/100 • ${trust.verifiedRatio}% güncel</small>`);
  });
}

function augmentPro() {
  const list = f$('.pro-features');
  if (!list || list.dataset.featureReady === '1') return;
  list.dataset.featureReady = '1';
  list.insertAdjacentHTML('beforeend', '<span>Sınırsız fiyat & stok alarmı</span><span>365 günlük gelişmiş fiyat geçmişi</span><span>Geniş favori / takip listesi</span>');
}

async function toggleFavorite(productId) {
  if (!featureState.dashboard?.user) {
    featureToast('Favori için önce giriş yap.');
    f$('#accountButton')?.click();
    return;
  }
  try {
    const result = await featureApi(`/api/features/favorites/${encodeURIComponent(productId)}`, { method: 'POST' });
    featureState.dashboard.favorites = result.favorites;
    f$$(`[data-favorite="${CSS.escape(productId)}"]`).forEach((button) => {
      button.classList.toggle('active', result.active);
      button.firstChild.textContent = result.active ? '★ ' : '☆ ';
    });
    renderFeatureHub();
    featureToast(result.active ? 'Takip listesine eklendi.' : 'Takip listesinden çıkarıldı.');
  } catch (error) {
    featureToast(error.message);
  }
}

function toggleCompare(productId) {
  if (featureState.selected.has(productId)) featureState.selected.delete(productId);
  else {
    if (featureState.selected.size >= 3) return featureToast('En fazla 3 ürünü aynı anda karşılaştırabilirsin.');
    featureState.selected.add(productId);
  }
  f$$(`[data-compare="${CSS.escape(productId)}"]`).forEach((button) => button.classList.toggle('active', featureState.selected.has(productId)));
  renderCompareBar();
}

function renderCompareBar() {
  let bar = f$('#featureCompareBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'featureCompareBar';
    bar.className = 'feature-compare-bar hidden';
    document.body.appendChild(bar);
  }
  const items = [...featureState.selected].map(productById).filter(Boolean);
  bar.classList.toggle('hidden', !items.length);
  bar.innerHTML = `<span><b>${items.length}</b> ürün seçildi</span><div>${items.map((item) => `<em>${esc(item.name)}</em>`).join('')}</div><button id="openCompare">Karşılaştır</button><button id="clearCompare" class="ghost">Temizle</button>`;
  f$('#openCompare', bar)?.addEventListener('click', openCompareDialog);
  f$('#clearCompare', bar)?.addEventListener('click', () => {
    featureState.selected.clear();
    f$$('[data-compare]').forEach((button) => button.classList.remove('active'));
    renderCompareBar();
  });
}

function ensureFeatureDialog() {
  let dialog = f$('#featureDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'featureDialog';
    dialog.className = 'feature-dialog';
    dialog.innerHTML = '<button class="dialog-close" data-feature-close>×</button><div id="featureDialogContent"></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('[data-feature-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
  return dialog;
}

function openCompareDialog() {
  const items = [...featureState.selected].map(productById).filter(Boolean);
  if (items.length < 2) return featureToast('Karşılaştırmak için en az 2 ürün seç.');
  const dialog = ensureFeatureDialog();
  const rows = [
    ['En düşük fiyat', (item) => money(item.bestPrice)],
    ['ArduFiyat skoru', (item) => `${item.insight.buyScore}/100 • ${item.insight.buyLabel}`],
    ['Stok', (item) => item.insight.stock],
    ['90/365g en düşük', (item) => item.insight.min ? money(item.insight.min) : '—'],
    ['Ortalama', (item) => item.insight.average ? money(item.insight.average) : '—'],
    ['Mağaza', (item) => item.bestStore?.name || '—'],
    ['SKU / model', (item) => item.sku || '—'],
    ['Kategori', (item) => item.category?.name || '—']
  ];
  f$('#featureDialogContent', dialog).innerHTML = `
    <span class="eyebrow">ÜRÜN KARŞILAŞTIRMA</span><h2>Yan yana karşılaştır</h2>
    <div class="compare-table-wrap"><table class="feature-compare-table"><thead><tr><th>Özellik</th>${items.map((item) => `<th>${esc(item.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, getter]) => `<tr><td>${label}</td>${items.map((item) => `<td>${esc(getter(item))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  dialog.showModal();
}

function openAlertDialog(productId) {
  if (!featureState.dashboard?.user) {
    featureToast('Alarm kurmak için giriş yap.');
    f$('#accountButton')?.click();
    return;
  }
  const product = productById(productId);
  if (!product) return;
  const dialog = ensureFeatureDialog();
  f$('#featureDialogContent', dialog).innerHTML = `
    <span class="eyebrow">AKILLI ALARM</span><h2>${esc(product.name)}</h2>
    <p>Şu an en düşük fiyat <b>${money(product.bestPrice)}</b>. Fiyat düştüğünde veya ürün yeniden stokta olduğunda bildirim al.</p>
    <form id="featureAlertForm" class="feature-form">
      <label>Hedef fiyat (₺)<input name="targetPrice" type="number" min="1" step="0.01" value="${Math.max(1, Math.floor(Number(product.bestPrice || 1) * 0.9))}"></label>
      <button class="primary-btn" type="submit">Fiyat alarmı kur</button>
      <button class="secondary-btn" type="button" id="stockAlertButton">Stok gelince haber ver</button>
      <small>Plan limiti: ${featureState.dashboard.limits.alerts} aktif alarm.</small>
    </form>`;
  dialog.showModal();
  f$('#featureAlertForm', dialog).addEventListener('submit', async (event) => {
    event.preventDefault();
    const targetPrice = Number(new FormData(event.currentTarget).get('targetPrice'));
    await createAlarm({ productId, type: 'price', targetPrice }, dialog);
  });
  f$('#stockAlertButton', dialog).addEventListener('click', () => createAlarm({ productId, type: 'stock' }, dialog));
}

async function createAlarm(payload, dialog) {
  try {
    const alert = await featureApi('/api/features/alerts', { method: 'POST', body: JSON.stringify(payload) });
    featureState.dashboard.alerts.push(alert);
    dialog.close();
    featureToast('Alarm kuruldu. 🔔');
  } catch (error) {
    featureToast(error.message);
  }
}

function chartSvg(points) {
  if (!points?.length) return '<div class="history-empty">Henüz yeterli fiyat geçmişi yok.</div>';
  const width = 720;
  const height = 210;
  const pad = 26;
  const prices = points.map((point) => Number(point.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(1, max - min);
  const coords = points.map((point, index) => {
    const x = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((Number(point.price) - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const path = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<div class="history-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Fiyat geçmişi grafiği"><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="grid-line"/><path d="${path}" class="price-line" fill="none"/>${coords.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="4"><title>${esc(points[index].date)}: ${esc(money(points[index].price))}</title></circle>`).join('')}</svg><div class="chart-labels"><span>En düşük ${money(min)}</span><span>En yüksek ${money(max)}</span></div></div>`;
}

async function enhanceOpenProduct() {
  const dialog = f$('#productDialog');
  const content = f$('#productDialogContent');
  const productId = featureState.activeProductId;
  if (!dialog?.open || !content || !productId || content.querySelector('.product-intelligence')) return;
  const product = productById(productId);
  if (!product) return;
  const panel = document.createElement('section');
  panel.className = 'product-intelligence';
  panel.innerHTML = `<div class="intelligence-loading">Fiyat geçmişi yükleniyor…</div>`;
  content.appendChild(panel);
  try {
    const history = await featureApi(`/api/features/history/${encodeURIComponent(productId)}?days=${featureState.dashboard?.limits?.historyDays || 90}`);
    panel.innerHTML = `
      <div class="intelligence-head"><div><span class="eyebrow">FİYAT ZEKA KATMANI</span><h3>Şimdi alınır mı?</h3></div><span class="big-buy-score">${esc(product.insight.buyScore)}/100</span></div>
      <div class="intelligence-grid">
        <div><small>Değerlendirme</small><b>${esc(product.insight.buyLabel)}</b></div>
        <div><small>Dönem en düşük</small><b>${product.insight.min ? money(product.insight.min) : '—'}</b></div>
        <div><small>Dönem ortalama</small><b>${product.insight.average ? money(product.insight.average) : '—'}</b></div>
        <div><small>Son değişim</small><b class="${trendClass(product.insight.changePct)}">${trendText(product.insight.changePct)}</b></div>
      </div>
      <h3>Fiyat geçmişi • ${history.days} gün</h3>${chartSvg(history.points)}
      <div class="intelligence-actions">
        <button class="primary-btn" data-product-alert="${esc(productId)}">🔔 Fiyat / stok alarmı</button>
        <button class="secondary-btn" data-product-favorite="${esc(productId)}">${featureState.dashboard.favorites?.includes(productId) ? '★ Takipten çıkar' : '☆ Takip et'}</button>
        <button class="secondary-btn" data-report-product="${esc(productId)}">⚑ Yanlış fiyat bildir</button>
        <a class="secondary-btn link-btn" href="/${esc(product.slug)}-fiyatlari">SEO fiyat sayfası ↗</a>
      </div>
      <small class="verification-note">Son doğrulama: ${product.insight.verifiedAt ? new Date(product.insight.verifiedAt).toLocaleString('tr-TR') : 'bilinmiyor'} • ${relativeTime(product.insight.verifiedAt)}</small>`;
  } catch (error) {
    panel.innerHTML = `<div class="history-empty">${esc(error.message)}</div>`;
  }
}

function openReportDialog(productId) {
  const product = productById(productId);
  if (!product) return;
  const dialog = ensureFeatureDialog();
  f$('#featureDialogContent', dialog).innerHTML = `
    <span class="eyebrow">VERİ KALİTESİ</span><h2>Yanlış bilgi bildir</h2><p>${esc(product.name)}</p>
    <form id="featureReportForm" class="feature-form">
      <label>Sorun<select name="type"><option value="wrong_price">Fiyat yanlış</option><option value="wrong_stock">Stok yanlış</option><option value="broken_link">Link çalışmıyor</option><option value="other">Diğer</option></select></label>
      <label>Not<textarea name="message" maxlength="500" placeholder="Kısaca neyin yanlış olduğunu yazabilirsin."></textarea></label>
      <button class="primary-btn" type="submit">Bildir</button>
    </form>`;
  dialog.showModal();
  f$('#featureReportForm', dialog).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await featureApi('/api/features/reports', { method: 'POST', body: JSON.stringify({ productId, offerId: product.insight.offerId, type: form.get('type'), message: form.get('message') }) });
      dialog.close();
      featureToast('Bildirim admin inceleme kuyruğuna gönderildi.');
    } catch (error) {
      featureToast(error.message);
    }
  });
}

function renderRouteMode() {
  const path = location.pathname;
  const routes = { '/firsatlar': 'deals', '/fiyati-dusenler': 'drops', '/favoriler': 'favorites' };
  if (routes[path]) {
    featureState.hubTab = routes[path];
    renderFeatureHub();
    f$('.hero')?.classList.add('route-compact');
    f$('.category-section')?.classList.add('route-hidden');
    f$('.stores-section')?.classList.add('route-hidden');
    f$('#smartFeatures')?.scrollIntoView({ block: 'start' });
  }
  if (path === '/karsilastir') {
    f$('.hero')?.classList.add('route-compact');
    featureToast('Ürün kartlarından 2 veya 3 ürünü karşılaştırmaya ekle.');
  }
}

function setupSearchSuggestions() {
  const input = f$('#searchInput');
  if (!input || input.dataset.suggestionReady === '1') return;
  input.dataset.suggestionReady = '1';
  const list = document.createElement('datalist');
  list.id = 'featureSearchSuggestions';
  document.body.appendChild(list);
  input.setAttribute('list', list.id);
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return (list.innerHTML = '');
    timer = setTimeout(async () => {
      try {
        const data = await featureApi(`/api/features/search-suggest?q=${encodeURIComponent(q)}`);
        list.innerHTML = (data.results || []).map((item) => `<option value="${esc(item.name)}">${esc(item.sku || item.brand || '')}</option>`).join('');
      } catch {}
    }, 250);
  });
}

function setupPwa() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    featureState.installPrompt = event;
    addInstallButton();
  });
}

function addInstallButton() {
  const actions = f$('.header-actions');
  if (!actions || f$('#installArduFiyat')) return;
  const button = document.createElement('button');
  button.id = 'installArduFiyat';
  button.className = 'ghost-btn feature-install-btn';
  button.textContent = 'Uygulamayı Kur';
  button.addEventListener('click', async () => {
    if (!featureState.installPrompt) return featureToast('Tarayıcın kurulum seçeneğini şu anda sunmuyor.');
    featureState.installPrompt.prompt();
    await featureState.installPrompt.userChoice.catch(() => null);
    featureState.installPrompt = null;
    button.remove();
  });
  actions.prepend(button);
}

function enhanceAccountDialog() {
  const dialog = f$('#accountDialog');
  if (!dialog?.open || !featureState.dashboard?.user || dialog.querySelector('.feature-account-panel')) return;
  const panel = document.createElement('div');
  panel.className = 'feature-account-panel';
  panel.innerHTML = `<h3>Akıllı takip</h3><p><b>${featureState.dashboard.favorites?.length || 0}</b> favori • <b>${featureState.dashboard.alerts?.length || 0}</b> aktif alarm</p><button id="telegramLinkFeature" class="secondary-btn full">Telegram bildirimlerini bağla</button><div id="telegramCodeFeature" class="telegram-code"></div>`;
  dialog.insertBefore(panel, f$('#logoutUserButton'));
  f$('#telegramLinkFeature', panel)?.addEventListener('click', async () => {
    try {
      const data = await featureApi('/api/features/telegram/link-code', { method: 'POST' });
      f$('#telegramCodeFeature', panel).innerHTML = data.botUsername
        ? `Telegram'da <b>@${esc(data.botUsername)}</b> botuna <code>/bagla ${esc(data.code)}</code> gönder. Kod ${data.expiresMinutes} dk geçerli.`
        : `Telegram botunda <code>/bagla ${esc(data.code)}</code> komutunu gönder. Kod ${data.expiresMinutes} dk geçerli. TELEGRAM_BOT_USERNAME değişkenini eklersen bot adı burada görünür.`;
    } catch (error) { featureToast(error.message); }
  });
}

function setupObservers() {
  const grid = f$('#productGrid');
  if (grid) new MutationObserver(() => augmentAll()).observe(grid, { childList: true, subtree: true });
  const stores = f$('#storeGrid');
  if (stores) new MutationObserver(() => augmentStores()).observe(stores, { childList: true, subtree: true });
  const productDialog = f$('#productDialog');
  if (productDialog) new MutationObserver(() => enhanceOpenProduct()).observe(productDialog, { attributes: true, attributeFilter: ['open'], childList: true, subtree: true });
  const account = f$('#accountDialog');
  if (account) new MutationObserver(() => enhanceAccountDialog()).observe(account, { attributes: true, attributeFilter: ['open'] });
}

function setupGlobalActions() {
  document.addEventListener('click', (event) => {
    const favorite = event.target.closest('[data-favorite], [data-product-favorite]');
    if (favorite) {
      event.preventDefault();
      event.stopPropagation();
      return toggleFavorite(favorite.dataset.favorite || favorite.dataset.productFavorite);
    }
    const compare = event.target.closest('[data-compare]');
    if (compare) {
      event.preventDefault();
      event.stopPropagation();
      return toggleCompare(compare.dataset.compare);
    }
    const alert = event.target.closest('[data-alert], [data-product-alert]');
    if (alert) {
      event.preventDefault();
      event.stopPropagation();
      return openAlertDialog(alert.dataset.alert || alert.dataset.productAlert);
    }
    const report = event.target.closest('[data-report-product]');
    if (report) {
      event.preventDefault();
      event.stopPropagation();
      return openReportDialog(report.dataset.reportProduct);
    }
    const card = event.target.closest('[data-product]');
    if (card && !event.target.closest('.feature-card-tools')) featureState.activeProductId = card.dataset.product;
  }, true);
}

async function initFeatures() {
  setupPwa();
  setupGlobalActions();
  setupObservers();
  setupSearchSuggestions();
  await loadFeatureDashboard({ quiet: true });
  setInterval(() => loadFeatureDashboard({ quiet: true }), 5 * 60_000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(initFeatures, 500));
else setTimeout(initFeatures, 500);
