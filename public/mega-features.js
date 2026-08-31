const mega = {
  dashboard: null,
  lastProductId: null,
  basket: JSON.parse(localStorage.getItem('arduMegaBasket') || '[]'),
  compare: JSON.parse(localStorage.getItem('arduMegaCompare') || '[]')
};

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0
    ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)
    : '—';
};

const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const token = () => localStorage.getItem('arduUserToken') || '';
const headers = (extra = {}) => ({ ...(token() ? { authorization: `Bearer ${token()}` } : {}), ...extra });

async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options, headers: headers(options.headers || {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `İstek başarısız (${response.status})`);
  return data;
}

function toast(message) {
  const existing = document.querySelector('#toast');
  if (existing) {
    existing.textContent = message;
    existing.classList.add('show');
    setTimeout(() => existing.classList.remove('show'), 2600);
    return;
  }
  const node = document.createElement('div');
  node.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:#18181b;color:white;padding:12px 16px;border-radius:12px;font:13px Arial';
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function saveBasket() {
  localStorage.setItem('arduMegaBasket', JSON.stringify(mega.basket));
  updateBasketButton();
}

function addBasket(productId, name = '') {
  const item = mega.basket.find((row) => row.productId === productId);
  if (item) item.qty += 1;
  else mega.basket.push({ productId, qty: 1, name });
  saveBasket();
  toast('Sepete eklendi.');
}

function addCompare(productId) {
  if (!mega.compare.includes(productId)) mega.compare.push(productId);
  mega.compare = mega.compare.slice(-3);
  localStorage.setItem('arduMegaCompare', JSON.stringify(mega.compare));
  toast(`Karşılaştırmaya eklendi (${mega.compare.length}/3).`);
}

function updateBasketButton() {
  let button = document.querySelector('.mega-basket-float');
  if (!button) {
    button = document.createElement('button');
    button.className = 'mega-basket-float';
    button.onclick = () => location.href = '/sepet';
    document.body.appendChild(button);
  }
  button.innerHTML = `Sepet <span>${mega.basket.reduce((sum, row) => sum + Number(row.qty || 0), 0)}</span>`;
}

function routeName() {
  return location.pathname.replace(/\/+$/, '') || '/';
}

function toolbar() {
  if (document.querySelector('.mega-toolbar')) return;
  const header = document.querySelector('.site-header') || document.querySelector('header');
  if (!header) return;
  const links = [
    ['/', 'Ana Sayfa'], ['/sepet', 'Sepet'], ['/projeler', 'Projeler'], ['/bom', 'BOM'], ['/akilli', 'Akıllı Katalog'],
    ['/uyumluluk', 'Uyumluluk'], ['/endeks', 'Endeks'], ['/tara', 'Barkod'], ['/profil', 'Profil'], ['/gelistirici', 'API'], ['/satici', 'Satıcı']
  ];
  const current = routeName();
  const nav = document.createElement('nav');
  nav.className = 'mega-toolbar';
  nav.innerHTML = links.map(([href, label]) => `<a href="${href}" class="${current === href ? 'mega-active' : ''}">${label}</a>`).join('') + '<a class="mega-index-chip" id="megaIndexChip">Endeks —</a>';
  header.insertAdjacentElement('afterend', nav);
}

function replaceMain(html) {
  const main = document.querySelector('main');
  if (!main) return;
  main.innerHTML = `<div class="mega-route-shell">${html}</div>`;
}

function hero(title, description, eyebrow = 'ARDUFİYAT LAB') {
  return `<section class="mega-hero-card"><small>${esc(eyebrow)}</small><h1>${esc(title)}</h1><p>${esc(description)}</p></section>`;
}

function insightClass(action) {
  return action === 'AL' ? 'mega-good' : action === 'PAHALI' ? 'mega-bad' : 'mega-warn';
}

async function loadDashboard() {
  mega.dashboard = await api('/api/mega/dashboard');
  const chip = document.querySelector('#megaIndexChip');
  if (chip) chip.textContent = `Endeks ${mega.dashboard.index?.value ?? '—'}`;
  return mega.dashboard;
}

async function renderBasket() {
  replaceMain(`${hero('Akıllı Sepet Karşılaştırma', 'Ürünleri mağaza bazında gruplayıp tek mağaza ile bölünmüş alışveriş maliyetini karşılaştırır. Kargo rakamları mağaza ayarlarına göre tahmindir.')}
    <div class="mega-grid"><section class="mega-card"><h3>Sepet</h3><div id="megaBasketRows" class="mega-stack"></div><div class="mega-form" style="margin-top:12px"><label>Şehir<input id="megaBasketCity" placeholder="Örn. Samsun"></label><button class="mega-btn" id="megaOptimize">En ucuz kombinasyonu bul</button></div></section><section class="mega-card"><h3>Sonuç</h3><div id="megaBasketResult" class="mega-empty">Hesaplamayı başlat.</div></section></div>`);
  const rows = document.querySelector('#megaBasketRows');
  function draw() {
    rows.innerHTML = mega.basket.length ? mega.basket.map((item, index) => `<div class="mega-project-item"><div><b>${esc(item.name || item.productId)}</b><small style="display:block">${esc(item.productId)}</small></div><div class="mega-row"><input data-qty="${index}" type="number" min="1" max="99" value="${item.qty}" style="width:68px;padding:8px;border:1px solid #ddd;border-radius:8px"><button class="mega-btn secondary" data-remove="${index}">Sil</button></div></div>`).join('') : '<div class="mega-empty">Sepet boş. Ana sayfadaki ürünlerden ekleyebilirsin.</div>';
    rows.querySelectorAll('[data-qty]').forEach((input) => input.onchange = () => { mega.basket[Number(input.dataset.qty)].qty = Math.max(1, Number(input.value || 1)); saveBasket(); });
    rows.querySelectorAll('[data-remove]').forEach((button) => button.onclick = () => { mega.basket.splice(Number(button.dataset.remove), 1); saveBasket(); draw(); });
  }
  draw();
  document.querySelector('#megaOptimize').onclick = async () => {
    if (!mega.basket.length) return toast('Sepet boş.');
    const output = document.querySelector('#megaBasketResult');
    output.className = 'mega-stack'; output.innerHTML = 'Hesaplanıyor…';
    try {
      const data = await api('/api/mega/basket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: mega.basket, city: document.querySelector('#megaBasketCity').value }) });
      const split = data.split;
      output.innerHTML = `<div class="mega-card"><div class="mega-kpi"><small>Bölünmüş en ucuz</small><b>${money(split.total)}</b></div><small>${split.stores.length} mağaza</small></div>
        ${data.bestSingle ? `<div class="mega-card"><div class="mega-kpi"><small>Tek mağaza: ${esc(data.bestSingle.storeName)}</small><b>${money(data.bestSingle.total)}</b></div><small>Kargo: ${money(data.bestSingle.shipping)}</small></div>` : '<div class="mega-notice">Bütün ürünleri aynı anda satan tek mağaza bulunamadı.</div>'}
        <div class="mega-notice">Öneri: <b>${data.recommended === 'single_store' ? 'Tek mağaza' : 'Mağazalara böl'}</b>${data.savingsVsSingle ? ` • yaklaşık ${money(data.savingsVsSingle)} avantaj` : ''}</div>
        ${split.stores.map((store) => `<div class="mega-card"><h3>${esc(store.storeName)}</h3><b>${money(store.total)}</b><small> • kargo ${money(store.shipping)}</small>${store.cityDelivery ? `<p>${esc(String(store.cityDelivery))}</p>` : ''}<div>${store.lines.map((line) => `<small style="display:block">${line.qty}× ${esc(line.name)} — ${money(line.unitPrice)}</small>`).join('')}</div></div>`).join('')}
        ${data.missing.length ? `<div class="mega-card"><h3>Fiyat bulunamayanlar</h3>${data.missing.map((x) => `<p>${esc(x.name)}</p>`).join('')}</div>` : ''}`;
    } catch (error) { output.innerHTML = `<div class="mega-notice mega-bad">${esc(error.message)}</div>`; }
  };
}

async function renderProjects() {
  const data = await api('/api/mega/projects');
  replaceMain(`${hero('Proje Maliyet Hesaplayıcı', 'Hazır elektronik projelerinde gereken parçaları ArduFiyat kataloğuyla eşleştirip en düşük sepet maliyetini hesaplar.')}
  <div class="mega-grid">${data.projects.map((project) => `<article class="mega-card"><small>${esc((project.tags || []).join(' • '))}</small><h3>${esc(project.name)}</h3><p>${esc(project.description || '')}</p><div>${(project.items || []).map((item) => `<div class="mega-project-item"><span>${esc(item.query)}</span><b>×${item.qty}</b></div>`).join('')}</div><button class="mega-btn" data-project="${esc(project.id)}" style="margin-top:12px">Maliyeti hesapla</button><div data-project-result="${esc(project.id)}" style="margin-top:12px"></div></article>`).join('')}</div>`);
  document.querySelectorAll('[data-project]').forEach((button) => button.onclick = async () => {
    const output = document.querySelector(`[data-project-result="${CSS.escape(button.dataset.project)}"]`);
    output.textContent = 'Hesaplanıyor…';
    try {
      const result = await api(`/api/mega/projects/${encodeURIComponent(button.dataset.project)}/calculate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      output.innerHTML = `<div class="mega-kpi"><small>En ucuz kombinasyon</small><b>${money(result.basket.split.total)}</b></div>${result.unresolved.length ? `<small>Eşleşmeyen: ${result.unresolved.map((x) => esc(x.query)).join(', ')}</small>` : '<span class="mega-pill good">Tüm parçalar eşleşti</span>'}`;
    } catch (error) { output.textContent = error.message; }
  });
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const separator = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(separator).map((x) => x.trim().toLowerCase());
  const hasHeader = header.some((x) => ['urun', 'ürün', 'name', 'product', 'sku', 'adet', 'qty', 'quantity'].includes(x));
  return lines.slice(hasHeader ? 1 : 0).map((line) => {
    const cells = line.split(separator).map((x) => x.trim().replace(/^"|"$/g, ''));
    const queryIndex = hasHeader ? Math.max(0, header.findIndex((x) => ['urun', 'ürün', 'name', 'product', 'sku'].includes(x))) : 0;
    const qtyIndex = hasHeader ? header.findIndex((x) => ['adet', 'qty', 'quantity'].includes(x)) : 1;
    return { query: cells[queryIndex] || '', qty: Number(cells[qtyIndex] || 1) || 1 };
  }).filter((row) => row.query);
}

async function loadSheetJs() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
  });
  return window.XLSX;
}

async function rowsFromFile(file) {
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await loadSheetJs();
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const raw = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' });
    const first = raw[0]?.map((x) => String(x).toLowerCase()) || [];
    const qIndex = Math.max(0, first.findIndex((x) => /ürün|urun|product|name|sku/.test(x)));
    const qtyIndex = first.findIndex((x) => /adet|qty|quantity/.test(x));
    return raw.slice(1).map((row) => ({ query: String(row[qIndex] || '').trim(), qty: Number(row[qtyIndex] || 1) || 1 })).filter((row) => row.query);
  }
  return parseCsv(await file.text());
}

async function renderBom() {
  replaceMain(`${hero('BOM / Parça Listesi Optimizasyonu', 'CSV veya XLSX parça listesini yükle. Ürünleri katalogla eşleştirip mağaza ve kargo bazında en ucuz satın alma planını çıkarır.')}
    <div class="mega-grid"><section class="mega-card"><div class="mega-dropzone" id="megaDrop"><b>CSV / XLSX dosyasını bırak veya seç</b><p>Kolonlar: Ürün/SKU ve Adet</p><input id="megaBomFile" type="file" accept=".csv,.txt,.xlsx,.xls"></div><div class="mega-form" style="margin-top:12px"><label>Veya satır satır yaz<textarea id="megaBomText" placeholder="ESP32,2\nDHT22,1\nOLED,1"></textarea></label><button class="mega-btn" id="megaBomRun">BOM'u hesapla</button></div></section><section class="mega-card"><h3>Sonuç</h3><div id="megaBomResult" class="mega-empty">Dosya yükle veya liste yaz.</div></section></div>`);
  let fileRows = [];
  const fileInput = document.querySelector('#megaBomFile');
  fileInput.onchange = async () => { if (fileInput.files[0]) { try { fileRows = await rowsFromFile(fileInput.files[0]); toast(`${fileRows.length} BOM satırı okundu.`); } catch (e) { toast(`Dosya okunamadı: ${e.message}`); } } };
  const drop = document.querySelector('#megaDrop');
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag'); };
  drop.ondragleave = () => drop.classList.remove('drag');
  drop.ondrop = async (e) => { e.preventDefault(); drop.classList.remove('drag'); const file = e.dataTransfer.files[0]; if (file) { fileRows = await rowsFromFile(file); toast(`${fileRows.length} BOM satırı okundu.`); } };
  document.querySelector('#megaBomRun').onclick = async () => {
    const textRows = parseCsv(document.querySelector('#megaBomText').value);
    const rows = fileRows.length ? fileRows : textRows;
    if (!rows.length) return toast('BOM boş.');
    const out = document.querySelector('#megaBomResult'); out.className = 'mega-stack'; out.innerHTML = 'Hesaplanıyor…';
    try {
      const result = await api('/api/mega/bom', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows }) });
      out.innerHTML = `<div class="mega-kpi"><small>En ucuz toplam</small><b>${money(result.basket.split.total)}</b></div>${result.resolved.map((row) => `<div class="mega-project-item"><div><b>${esc(row.query)}</b><small style="display:block">→ ${esc(row.selected.name)}</small></div><span>${row.qty} × ${money(row.selected.price)}</span></div>`).join('')}${result.unresolved.length ? `<div class="mega-notice">Eşleşmeyen: ${result.unresolved.map((row) => esc(row.query)).join(', ')}</div>` : ''}`;
    } catch (e) { out.innerHTML = esc(e.message); }
  };
}

async function renderSmartCatalog() {
  const [dashboard, filters] = await Promise.all([loadDashboard(), api('/api/mega/filters')]);
  const brands = [...new Set((dashboard.realDeals || []).map((x) => x.brand).filter(Boolean))];
  replaceMain(`${hero('Akıllı Katalog', 'Teknik özelliklere, SKU/model numarasına ve fiyat davranışına göre ürün keşfi. “Gerçek indirim” geçmiş fiyat ortalamasına göre hesaplanır.')}
  <div class="mega-grid"><section class="mega-card"><h3>Arama ve teknik filtre</h3><div class="mega-form"><label>Ürün / SKU / model<input id="megaCatalogQ" placeholder="ESP32, CH340, WROOM…"></label><div id="megaSpecFilters"></div><button class="mega-btn" id="megaCatalogRun">Filtrele</button></div></section><section class="mega-card"><h3>Öne çıkan gerçek indirimler</h3>${dashboard.realDeals.slice(0, 8).map((item) => `<div class="mega-project-item"><div><b>${esc(item.name)}</b><small style="display:block">30 güne göre %${item.discountVs30Pct}</small></div><span class="mega-pill good">${item.action}</span></div>`).join('') || '<p>Henüz yeterli fiyat geçmişi yok.</p>'}</section></div><section class="mega-card" style="margin-top:14px"><h3>Sonuçlar</h3><div id="megaCatalogResults" class="mega-grid"></div></section>`);
  const specRoot = document.querySelector('#megaSpecFilters');
  specRoot.innerHTML = filters.filters.slice(0, 8).map((filter) => `<label>${esc(filter.key)}<select data-spec="${esc(filter.key)}"><option value="">Tümü</option>${filter.values.slice(0, 30).map((value) => `<option>${esc(value)}</option>`).join('')}</select></label>`).join('');
  document.querySelector('#megaCatalogRun').onclick = async () => {
    const params = new URLSearchParams();
    const q = document.querySelector('#megaCatalogQ').value.trim(); if (q) params.set('q', q);
    document.querySelectorAll('[data-spec]').forEach((select) => { if (select.value) params.set(`spec.${select.dataset.spec}`, select.value); });
    const data = await api(`/api/mega/catalog?${params}`);
    document.querySelector('#megaCatalogResults').innerHTML = data.products.length ? data.products.map((product) => `<article class="mega-card"><h3>${esc(product.name)}</h3><b>${money(product.price)}</b><p>${esc(product.brand)} ${esc(product.sku)}</p><div class="mega-row"><span class="mega-pill ${product.insight?.action === 'AL' ? 'good' : product.insight?.action === 'PAHALI' ? 'bad' : 'warn'}">${esc(product.insight?.action || '—')}</span>${product.unavailableInTurkey ? '<span class="mega-pill bad">Türkiye’de bulunamadı</span>' : ''}</div><button class="mega-btn secondary" data-open-product="${esc(product.id)}" style="margin-top:10px">Detay</button></article>`).join('') : '<div class="mega-empty">Sonuç yok.</div>';
    document.querySelectorAll('[data-open-product]').forEach((button) => button.onclick = () => location.href = `/?urun=${encodeURIComponent(button.dataset.openProduct)}`);
  };
  document.querySelector('#megaCatalogRun').click();
}

async function renderCompatibility() {
  replaceMain(`${hero('Uyumluluk Kontrolü', 'Birlikte kullanacağın ürünleri seç. Voltaj/lojik seviyeleri ve motor sürücü gibi temel gereksinimler için uyarı üretir.')}
  <div class="mega-grid"><section class="mega-card"><div class="mega-form"><label>Ürün ara<input id="megaCompatQ" placeholder="ESP32"></label><button class="mega-btn" id="megaCompatSearch">Ara</button></div><div id="megaCompatResults" class="mega-stack" style="margin-top:12px"></div><h3 style="margin-top:18px">Seçilenler</h3><div id="megaCompatSelected" class="mega-stack"></div><button class="mega-btn" id="megaCompatRun" style="margin-top:12px">Uyumluluğu kontrol et</button></section><section class="mega-card"><h3>Analiz</h3><div id="megaCompatOutput" class="mega-empty">En az iki ürün seç.</div></section></div>`);
  const selected = [...mega.compare];
  const drawSelected = async () => {
    const root = document.querySelector('#megaCompatSelected');
    root.innerHTML = selected.length ? selected.map((idValue) => `<div class="mega-project-item"><span>${esc(idValue)}</span><button class="mega-btn secondary" data-del-compat="${esc(idValue)}">Sil</button></div>`).join('') : '<small>Henüz ürün seçilmedi.</small>';
    root.querySelectorAll('[data-del-compat]').forEach((button) => button.onclick = () => { selected.splice(selected.indexOf(button.dataset.delCompat), 1); drawSelected(); });
  };
  drawSelected();
  document.querySelector('#megaCompatSearch').onclick = async () => {
    const data = await api(`/api/mega/search?q=${encodeURIComponent(document.querySelector('#megaCompatQ').value)}`);
    document.querySelector('#megaCompatResults').innerHTML = data.products.slice(0, 6).map((item) => `<div class="mega-project-item"><div><b>${esc(item.name)}</b><small style="display:block">${money(item.price)}</small></div><button class="mega-btn secondary" data-add-compat="${esc(item.id)}">Ekle</button></div>`).join('');
    document.querySelectorAll('[data-add-compat]').forEach((button) => button.onclick = () => { if (!selected.includes(button.dataset.addCompat)) selected.push(button.dataset.addCompat); while (selected.length > 12) selected.shift(); drawSelected(); });
  };
  document.querySelector('#megaCompatRun').onclick = async () => {
    if (selected.length < 2) return toast('En az iki ürün seç.');
    const result = await api('/api/mega/compatibility', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productIds: selected }) });
    document.querySelector('#megaCompatOutput').className = 'mega-stack';
    document.querySelector('#megaCompatOutput').innerHTML = `<span class="mega-pill ${result.compatible ? 'good' : 'bad'}">${result.compatible ? 'Temel kontrolde uyumlu' : 'Sorun bulundu'}</span>${result.issues.map((issue) => `<div class="mega-notice ${issue.severity === 'error' ? 'mega-bad' : 'mega-warn'}">${esc(issue.message)}</div>`).join('')}${result.notes.map((note) => `<div class="mega-notice">${esc(note)}</div>`).join('') || '<p>Ek uyarı yok.</p>'}`;
  };
}

async function renderIndex() {
  const data = await loadDashboard();
  const maxProducts = Math.max(1, ...data.categories.map((x) => x.products));
  replaceMain(`${hero('ArduFiyat Elektronik Endeksi', 'Katalogdaki ürünlerin geçmiş fiyatlarına göre oluşturulan baz 100 elektronik fiyat göstergesi. Kategori hareketlerini de birlikte gösterir.')}
  <div class="mega-grid"><section class="mega-card"><small>ENDeks</small><div class="mega-stat">${data.index.value ?? '—'}</div><p>Baz: 100 • ${data.index.products} ürün</p><span class="mega-pill ${Number(data.index.changeFromBasePct) <= 0 ? 'good' : 'warn'}">${data.index.changeFromBasePct > 0 ? '+' : ''}${data.index.changeFromBasePct ?? 0}%</span></section><section class="mega-card"><h3>Bugün alınabilir görünenler</h3>${data.buyNow.slice(0, 6).map((x) => `<div class="mega-project-item"><span>${esc(x.name)}</span><b>${x.buyScore}/100</b></div>`).join('') || '<p>Yeterli veri yok.</p>'}</section></div>
  <section class="mega-card" style="margin-top:14px"><h3>Kategori istatistikleri</h3><div class="mega-bars">${data.categories.map((row) => `<div class="mega-bar-row"><span>${esc(row.name)}</span><div class="mega-bar-track"><i style="width:${Math.max(4, row.products / maxProducts * 100)}%"></i></div><b>${row.changePct > 0 ? '+' : ''}${row.changePct}%</b></div>`).join('')}</div></section>`);
}

async function renderProfile() {
  if (!token()) {
    replaceMain(`${hero('Kişisel ArduFiyat', 'Fiyat bildirimlerini, şehir teslimat tahminini ve ilgi alanlarını hesabına göre kişiselleştir.')}
      <div class="mega-empty">Profil ayarları için önce giriş yap.</div>`); return;
  }
  const data = await api('/api/mega/profile');
  replaceMain(`${hero('Profil ve Akıllı Bildirimler', 'Favorilerindeki anlamlı fiyat hareketleri için minimum yüzde/TL eşiğini belirle. Küçük dalgalanmalarda bildirim gönderilmez.')}
  <div class="mega-grid"><section class="mega-card"><h3>${esc(data.name || 'Profil')}</h3><div class="mega-stat">${data.points} puan</div><span class="mega-pill good">Seviye ${data.level} • ${esc(data.name)}</span></section><section class="mega-card"><form id="megaProfileForm" class="mega-form"><label>Şehir<input id="megaProfileCity" value="${esc(data.city || '')}" placeholder="Samsun"></label><label>İlgi alanları (virgülle)<input id="megaProfileInterests" value="${esc((data.interests || []).join(', '))}" placeholder="IoT, robotik, ESP32"></label><label>Minimum fiyat düşüşü (%)<input id="megaProfilePct" type="number" min="1" max="80" value="${data.minAlertPct}"></label><label>Minimum fiyat düşüşü (TL)<input id="megaProfileTry" type="number" min="1" value="${data.minAlertTry}"></label><label><input id="megaDigest" type="checkbox" ${data.digestEnabled ? 'checked' : ''}> Haftalık e-posta özeti</label><button class="mega-btn">Kaydet</button></form></section></div>`);
  document.querySelector('#megaProfileForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/mega/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ city: document.querySelector('#megaProfileCity').value, interests: document.querySelector('#megaProfileInterests').value.split(',').map((x) => x.trim()).filter(Boolean), minAlertPct: Number(document.querySelector('#megaProfilePct').value), minAlertTry: Number(document.querySelector('#megaProfileTry').value), digestEnabled: document.querySelector('#megaDigest').checked }) });
      toast('Profil kaydedildi.');
    } catch (error) { toast(error.message); }
  };
}

async function renderDeveloper() {
  replaceMain(`${hero('ArduFiyat Developer API', 'Ürün, teklif ve fırsat verisini salt okunur API v2 üzerinden kullan. Anahtarını hesabından üret; anahtar yalnızca oluşturulduğu anda gösterilir.')}
  <div class="mega-grid"><section class="mega-card"><h3>API v2</h3><div class="mega-code">GET /api/v2/products?q=esp32\nGET /api/v2/products/:id\nGET /api/v2/deals\nGET /api/v2/index\nGET /api/v2/match?q=ESP32\nHeader: x-api-key: af_live_...</div><button class="mega-btn" id="megaDevKey" style="margin-top:12px">Yeni API key üret</button><div id="megaDevKeyOutput" style="margin-top:12px"></div></section><section class="mega-card"><h3>Tarayıcı Eklentisi</h3><div class="mega-extension-box">Repo içindeki <b>browser-extension/</b> klasörü Chrome/Edge için “başka yerde daha ucuz” yardımcı eklentisinin kaynaklarını içerir.</div><p>Uzantı bulunduğun ürün sayfasını ArduFiyat API ile eşleştirir.</p></section></div>`);
  document.querySelector('#megaDevKey').onclick = async () => {
    if (!token()) return toast('Önce giriş yap.');
    try {
      const data = await api('/api/mega/dev-key', { method: 'POST' });
      document.querySelector('#megaDevKeyOutput').innerHTML = `<div class="mega-code">${esc(data.apiKey)}</div><div class="mega-notice">Bu anahtarı şimdi kopyala. Sonradan tekrar gösterilmez.</div>`;
    } catch (error) { toast(error.message); }
  };
}

async function renderSeller() {
  replaceMain(`${hero('Mağaza / Satıcı Entegrasyonu', 'Mağazalar kendi fiyat ve stok feed’lerini ArduFiyat’a gönderebilir. Sponsorlu teklifler açıkça etiketlenir; normal karşılaştırma verisinden gizlenmez.')}
  <div class="mega-grid"><section class="mega-card"><h3>Merchant Feed API</h3><div class="mega-code">POST /api/mega/merchant/feed\nHeader: x-merchant-key: af_merchant_...\nContent-Type: application/json\n\n{\n  "items": [{\n    "sku": "ESP32-WROOM",\n    "price": 249.90,\n    "stock": "in_stock",\n    "url": "https://magaza.com/urun/...",\n    "sponsored": false\n  }]\n}</div><p>Merchant anahtarını ArduFiyat admini mağaza için üretir. URL mağazanın kayıtlı alan adıyla eşleşmelidir.</p></section><section class="mega-card"><h3>Şeffaf sponsor / affiliate</h3><p>Bir mağaza için sponsor desteği admin tarafından açılırsa feed’de <code>sponsored:true</code> gönderilebilir. Kullanıcı arayüzünde “Sponsorlu” etiketi gösterilir.</p><p>Affiliate link varsa yönlendirme <code>/go/:offerId</code> üzerinden kayıt altına alınır.</p></section></div>`);
}

async function renderScanner() {
  replaceMain(`${hero('Barkod / QR Ürün Arama', 'Kamera destekliyorsa barkod veya QR kodunu tara; desteklenmiyorsa SKU/model kodunu elle gir.')}
  <div class="mega-grid"><section class="mega-card"><video id="megaScannerVideo" class="mega-scanner-video" playsinline></video><div class="mega-row" style="margin-top:12px"><button class="mega-btn" id="megaScannerStart">Kamerayı başlat</button><button class="mega-btn secondary" id="megaScannerStop">Durdur</button></div></section><section class="mega-card"><form id="megaScannerForm" class="mega-form"><label>Kod / SKU<input id="megaScannerCode" placeholder="869… veya ESP32-WROOM"></label><button class="mega-btn">ArduFiyat'ta ara</button></form><div id="megaScannerResults" class="mega-stack" style="margin-top:12px"></div></section></div>`);
  let stream = null; let running = false;
  const video = document.querySelector('#megaScannerVideo');
  const search = async (value) => {
    const data = await api(`/api/mega/search?q=${encodeURIComponent(value)}`);
    document.querySelector('#megaScannerResults').innerHTML = data.products.length ? data.products.map((item) => `<div class="mega-project-item"><div><b>${esc(item.name)}</b><small style="display:block">${esc(item.sku)} • ${money(item.price)}</small></div><button class="mega-btn secondary" data-scan-add="${esc(item.id)}">Sepete ekle</button></div>`).join('') : '<div class="mega-empty">Eşleşme bulunamadı.</div>';
    document.querySelectorAll('[data-scan-add]').forEach((button) => button.onclick = () => addBasket(button.dataset.scanAdd, button.closest('.mega-project-item').querySelector('b').textContent));
  };
  document.querySelector('#megaScannerForm').onsubmit = (e) => { e.preventDefault(); if (document.querySelector('#megaScannerCode').value.trim()) search(document.querySelector('#megaScannerCode').value.trim()); };
  document.querySelector('#megaScannerStart').onclick = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); video.srcObject = stream; await video.play(); running = true;
      if (!('BarcodeDetector' in window)) return toast('Tarayıcın otomatik BarcodeDetector desteklemiyor; kodu elle girebilirsin.');
      const detector = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
      const loop = async () => { if (!running) return; try { const codes = await detector.detect(video); if (codes[0]?.rawValue) { document.querySelector('#megaScannerCode').value = codes[0].rawValue; await search(codes[0].rawValue); running = false; stream?.getTracks().forEach((track) => track.stop()); return; } } catch {} requestAnimationFrame(loop); }; loop();
    } catch (error) { toast(`Kamera açılamadı: ${error.message}`); }
  };
  document.querySelector('#megaScannerStop').onclick = () => { running = false; stream?.getTracks().forEach((track) => track.stop()); video.srcObject = null; };
}

async function renderGlobal() {
  const fx = await api('/api/mega/fx');
  replaceMain(`${hero('Türkiye vs Global Fiyat', 'Global teklifler admin veya mağaza feed’leriyle eklendiğinde kur, kargo ve tahmini vergiyle Türkiye fiyatına karşılaştırılır. Canlı kur kaynağı TCMB’dir.')}
  <div class="mega-grid"><section class="mega-card"><h3>Kur durumu</h3>${Object.entries(fx.rates || {}).map(([code, value]) => `<div class="mega-project-item"><span>${esc(code)}/TRY</span><b>${Number(value).toFixed(4)}</b></div>`).join('') || '<p>Kur henüz alınmadı.</p>'}<small>${esc(fx.source || '')} • ${fx.updatedAt ? new Date(fx.updatedAt).toLocaleString('tr-TR') : ''}</small></section><section class="mega-card"><div class="mega-form"><label>Ürün ara<input id="megaGlobalQ" placeholder="ESP32"></label><button class="mega-btn" id="megaGlobalSearch">Karşılaştır</button></div><div id="megaGlobalResult" style="margin-top:12px"></div></section></div>`);
  document.querySelector('#megaGlobalSearch').onclick = async () => {
    const q = document.querySelector('#megaGlobalQ').value.trim(); if (!q) return;
    const matches = await api(`/api/mega/search?q=${encodeURIComponent(q)}`); if (!matches.products[0]) return toast('Ürün bulunamadı.');
    const data = await api(`/api/mega/product/${encodeURIComponent(matches.products[0].id)}`);
    document.querySelector('#megaGlobalResult').innerHTML = `<h3>${esc(data.product.name)}</h3><p>Türkiye: <b>${money(data.global.turkeyPrice)}</b></p>${data.global.offers.length ? data.global.offers.map((offer) => `<div class="mega-project-item"><div><b>${esc(offer.source)}</b><small style="display:block">${esc(offer.country)} • ${esc(offer.currency)}</small></div><span>${money(offer.landedTry)}</span></div>`).join('') : '<div class="mega-notice">Bu ürün için global feed teklifi henüz eklenmedi.</div>'}`;
  };
}

async function augmentCards() {
  if (!mega.dashboard) await loadDashboard().catch(() => null);
  const dealMap = new Map((mega.dashboard?.realDeals || []).map((x) => [x.id, x]));
  const buyMap = new Map((mega.dashboard?.buyNow || []).map((x) => [x.id, x]));
  document.querySelectorAll('[data-product]').forEach((card) => {
    if (card.dataset.megaReady) return; card.dataset.megaReady = '1';
    const idValue = card.dataset.product;
    const badges = document.createElement('div'); badges.className = 'mega-card-badges';
    const deal = dealMap.get(idValue); const buy = buyMap.get(idValue);
    badges.innerHTML = `${deal ? `<span class="mega-pill good">Gerçek indirim %${deal.discountVs30Pct}</span>` : ''}${buy ? `<span class="mega-pill good">${buy.buyScore}/100 AL</span>` : ''}`;
    card.appendChild(badges);
    const info = card.querySelector('.product-info');
    if (info) {
      const actions = document.createElement('div'); actions.className = 'mega-product-actions';
      actions.innerHTML = `<button data-mega-basket="${esc(idValue)}">+ Sepet</button><button data-mega-compare="${esc(idValue)}">⇄ Uyumluluk</button>`;
      info.appendChild(actions);
      actions.querySelector('[data-mega-basket]').onclick = (e) => { e.stopPropagation(); addBasket(idValue, card.querySelector('h3')?.textContent || idValue); };
      actions.querySelector('[data-mega-compare]').onclick = (e) => { e.stopPropagation(); addCompare(idValue); };
    }
    card.addEventListener('click', () => { mega.lastProductId = idValue; });
  });
}

function detailBlock(data) {
  const i = data.intelligence || {};
  const best = data.recommendedOffers?.[0];
  const timing = data.timing || {};
  return `<section class="mega-detail" id="megaDetailPanel"><div class="mega-row"><span class="mega-pill ${i.realDiscount ? 'good' : 'warn'}">${i.realDiscount ? `Gerçek indirim %${i.discountVs30Pct}` : `30 gün farkı %${i.discountVs30Pct || 0}`}</span><span class="mega-pill ${i.action === 'AL' ? 'good' : i.action === 'PAHALI' ? 'bad' : 'warn'}">${esc(i.action || 'BEKLE')} • ${i.buyScore || 0}/100</span></div>
  <div class="mega-detail-grid" style="margin-top:12px"><div class="mega-card"><small>30 gün ortalama</small><div class="mega-kpi"><b>${money(i.average30)}</b></div></div><div class="mega-card"><small>90 gün en düşük</small><div class="mega-kpi"><b>${money(i.low90)}</b></div></div><div class="mega-card"><small>7 gün tahmin</small><div class="mega-kpi"><b>${money(i.predicted7dPrice)}</b><small>güven %${Math.round((i.predictionConfidence || 0) * 100)}</small></div></div><div class="mega-card"><small>Önerilen teklif</small><div class="mega-kpi"><b>${best ? `${best.score}/100` : '—'}</b><small>${esc(best?.storeName || '')}</small></div>${best?.sponsored ? '<span class="mega-sponsored">SPONSORLU</span>' : ''}</div></div>
  ${timing.bestWeekday ? `<div class="mega-notice">Geçmiş veride daha avantajlı gün: <b>${['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'][timing.bestWeekday.weekday]}</b>. Bu istatistik garanti değildir.</div>` : ''}
  <div class="mega-grid"><div class="mega-card"><h3>Alternatifler</h3>${data.alternatives.map((x) => `<div class="mega-project-item"><span>${esc(x.name)}</span><b>${money(x.price)}</b></div>`).join('') || '<small>Alternatif bulunamadı.</small>'}</div><div class="mega-card"><h3>Bununla gerekenler</h3>${data.accessories.map((x) => `<div class="mega-project-item"><span>${esc(x.name)}</span><button class="mega-btn secondary" data-detail-add="${esc(x.id)}">${money(x.price)} +</button></div>`).join('') || '<small>Öneri yok.</small>'}</div></div>
  <div class="mega-card"><h3>Topluluk notları</h3><div class="mega-stack">${data.comments.slice(0, 8).map((comment) => `<div class="mega-comment"><b>${esc(comment.author.name)} • ${esc(comment.author.name)} ${comment.author.points}p</b><p>${esc(comment.text)}</p><small>${new Date(comment.createdAt).toLocaleString('tr-TR')}</small></div>`).join('') || '<small>İlk teknik notu sen yaz.</small>'}</div>${token() ? `<form id="megaCommentForm" class="mega-form" style="margin-top:10px"><textarea id="megaCommentText" placeholder="Uyumluluk, sürücü, voltaj, kullanım deneyimi…"></textarea><button class="mega-btn">Yorum ekle</button></form>` : '<div class="mega-notice">Yorum için giriş yap.</div>'}</div>
  <div class="mega-card"><h3>Fiyat / stok bildir</h3>${token() ? `<form id="megaPriceSubmit" class="mega-form"><div class="mega-row"><input id="megaReportedPrice" type="number" step="0.01" placeholder="Gördüğün fiyat"><select id="megaReportedStock"><option value="in_stock">Stokta</option><option value="low_stock">Kritik stok</option><option value="out_of_stock">Tükendi</option><option value="unknown">Bilinmiyor</option></select></div><input id="megaReportedUrl" placeholder="Kaynak URL"><button class="mega-btn secondary">Admin doğrulamasına gönder (+10 puan onayda)</button></form>` : '<small>Bildirim için giriş yap.</small>'}</div>
  ${data.global.offers.length ? `<div class="mega-card"><h3>Global karşılaştırma</h3>${data.global.offers.slice(0, 5).map((x) => `<div class="mega-project-item"><div><b>${esc(x.source)}</b><small style="display:block">${esc(x.country)}</small></div><span>${money(x.landedTry)}</span></div>`).join('')}</div>` : ''}</section>`;
}

async function augmentProductDialog() {
  const root = document.querySelector('#productDialogContent');
  if (!root || !mega.lastProductId || root.querySelector('#megaDetailPanel')) return;
  try {
    const data = await api(`/api/mega/product/${encodeURIComponent(mega.lastProductId)}`);
    root.insertAdjacentHTML('beforeend', detailBlock(data));
    root.querySelectorAll('[data-detail-add]').forEach((button) => button.onclick = () => addBasket(button.dataset.detailAdd, button.closest('.mega-project-item').querySelector('span').textContent));
    const comment = root.querySelector('#megaCommentForm');
    if (comment) comment.onsubmit = async (e) => { e.preventDefault(); try { await api('/api/mega/comments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: mega.lastProductId, text: root.querySelector('#megaCommentText').value }) }); toast('Yorum eklendi.'); root.querySelector('#megaDetailPanel').remove(); augmentProductDialog(); } catch (err) { toast(err.message); } };
    const report = root.querySelector('#megaPriceSubmit');
    if (report) report.onsubmit = async (e) => { e.preventDefault(); try { await api('/api/mega/price-submissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: mega.lastProductId, price: Number(root.querySelector('#megaReportedPrice').value), stock: root.querySelector('#megaReportedStock').value, sourceUrl: root.querySelector('#megaReportedUrl').value }) }); toast('Fiyat bildirimi admin onayına gönderildi.'); } catch (err) { toast(err.message); } };
  } catch {}
}

function queryOpenProduct() {
  const idValue = new URLSearchParams(location.search).get('urun');
  if (!idValue) return;
  let attempts = 0;
  const timer = setInterval(() => {
    const card = document.querySelector(`[data-product="${CSS.escape(idValue)}"]`);
    attempts += 1;
    if (card) { clearInterval(timer); mega.lastProductId = idValue; card.click(); }
    if (attempts > 15) clearInterval(timer);
  }, 300);
}

async function initRoute() {
  const route = routeName();
  const routes = {
    '/sepet': renderBasket, '/projeler': renderProjects, '/bom': renderBom, '/akilli': renderSmartCatalog,
    '/uyumluluk': renderCompatibility, '/endeks': renderIndex, '/profil': renderProfile, '/gelistirici': renderDeveloper,
    '/satici': renderSeller, '/tara': renderScanner, '/global': renderGlobal
  };
  if (routes[route]) {
    try { await routes[route](); } catch (error) { replaceMain(`${hero('ArduFiyat', 'Araç yüklenemedi.')}<div class="mega-notice mega-bad">${esc(error.message)}</div>`); }
  }
}

async function init() {
  toolbar(); updateBasketButton();
  loadDashboard().then(() => augmentCards()).catch(() => {});
  await initRoute();
  if (routeName() === '/') {
    queryOpenProduct();
    const observer = new MutationObserver(() => { augmentCards(); augmentProductDialog(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(augmentCards, 1500);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
else setTimeout(init, 100);
