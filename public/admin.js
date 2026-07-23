const state = {
  token: localStorage.getItem('arduAdminToken') || '',
  data: null,
  view: 'dashboard',
  editing: null,
  geminiWasRunning: false,
  geminiPollTimer: null
};

const $ = (selector) => document.querySelector(selector);

const esc = (value = '') =>
  String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);

const money = (value) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY'
  }).format(Number(value || 0));

const titles = {
  dashboard: 'Genel Bakış',
  products: 'Ürünler',
  stores: 'Mağazalar',
  offers: 'Teklifler',
  users: 'Kullanıcılar',
  ads: 'Reklamlar',
  campaigns: 'Kampanyalar',
  banners: 'Bannerlar',
  coupons: 'Kuponlar',
  settings: 'Site & Reklam Ayarları',
  syncLogs: 'Güncelleme Kayıtları'
};

const singularTitles = {
  products: 'Ürün',
  stores: 'Mağaza',
  offers: 'Teklif',
  ads: 'Reklam',
  campaigns: 'Kampanya',
  banners: 'Banner',
  coupons: 'Kupon'
};

const configs = {
  products: {
    fields: [
      ['name', 'Ürün adı', 'text'],
      ['sku', 'SKU', 'text'],
      ['brand', 'Marka', 'text'],
      ['categoryId', 'Kategori', 'category'],
      ['description', 'Açıklama', 'textarea', 'full'],
      ['tags', 'Etiketler (virgülle)', 'tags', 'full'],
      ['imageUrl', 'Doğrudan fotoğraf URL veya /images yolu', 'url', 'full'],
      ['imageSourceUrl', 'Fotoğrafın alınacağı ürün sayfası URL', 'url', 'full'],
      ['imageKey', 'Yedek görsel türü', 'text'],
      ['featured', 'Öne çıkan', 'checkbox'],
      ['active', 'Aktif', 'checkbox']
    ]
  },
  stores: {
    fields: [
      ['name', 'Mağaza adı', 'text'],
      ['slug', 'Kısa ad', 'text'],
      ['domain', 'Alan adı', 'text'],
      ['logoText', 'Logo harfi', 'text'],
      [
        'integrationMode',
        'Entegrasyon modu',
        'select',
        null,
        ['manual_verified', 'merchant_csv', 'official_api', 'marketplace_link']
      ],
      ['termsUrl', 'Koşullar URL', 'url', 'full'],
      ['termsNote', 'Entegrasyon notu', 'textarea', 'full'],
      ['active', 'Aktif', 'checkbox']
    ]
  },
  offers: {
    fields: [
      ['productId', 'Ürün', 'product'],
      ['storeId', 'Mağaza', 'store'],
      ['price', 'Fiyat', 'number'],
      ['shipping', 'Kargo bilgisi', 'text'],
      [
        'stock',
        'Stok',
        'select',
        null,
        ['in_stock', 'low_stock', 'out_of_stock', 'unknown']
      ],
      ['url', 'Doğrudan ürün URL (arama/liste sayfası kabul edilmez)', 'url', 'full'],
      ['imageUrl', 'Teklif fotoğrafı', 'image-upload', 'full'],
      ['verifiedAt', 'Doğrulama tarihi', 'datetime-local'],
      [
        'sourceType',
        'Kaynak türü',
        'select',
        null,
        ['manual_verified', 'merchant_csv', 'official_api', 'admin_import', 'gemini_url_context']
      ],
      ['active', 'Aktif', 'checkbox']
    ]
  },
  ads: {
    fields: [
      ['title', 'Reklam başlığı', 'text'],
      ['sponsor', 'Sponsor adı', 'text'],
      ['description', 'Açıklama', 'textarea', 'full'],
      ['imageUrl', 'Görsel URL veya /images yolu', 'url', 'full'],
      ['targetUrl', 'Hedef bağlantı', 'text', 'full'],
      ['placement', 'Gösterim alanı', 'select', null, ['top_banner', 'product_grid', 'footer_banner']],
      ['order', 'Sıra', 'number'],
      ['active', 'Aktif', 'checkbox']
    ]
  },
  campaigns: {
    fields: [
      ['name', 'Kampanya adı', 'text'],
      ['badge', 'Rozet', 'text'],
      ['description', 'Açıklama', 'textarea', 'full'],
      ['productIds', 'Ürün ID listesi (virgülle)', 'tags', 'full'],
      ['active', 'Aktif', 'checkbox']
    ]
  },
  banners: {
    fields: [
      ['title', 'Başlık', 'text'],
      ['subtitle', 'Alt başlık', 'textarea', 'full'],
      ['cta', 'Buton metni', 'text'],
      ['target', 'Hedef', 'text'],
      ['theme', 'Tema', 'select', null, ['orange', 'blue', 'dark']],
      ['order', 'Sıra', 'number'],
      ['active', 'Aktif', 'checkbox']
    ]
  },
  coupons: {
    fields: [
      ['storeId', 'Mağaza', 'store'],
      ['code', 'Kupon kodu', 'text'],
      ['title', 'Başlık', 'text'],
      ['description', 'Açıklama', 'textarea', 'full'],
      ['expiresAt', 'Bitiş tarihi', 'datetime-local'],
      ['internalNote', 'İç not', 'textarea', 'full'],
      ['active', 'Aktif', 'checkbox']
    ]
  }
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${state.token}`,
      ...options.headers
    }
  });

  if (response.status === 401) {
    logout();
    throw new Error('Oturum sona erdi.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'İşlem başarısız.');
  }

  return response.status === 204 ? null : response.json();
}

async function load() {
  state.data = await api('/api/admin/dashboard');
  render();
  void pollGeminiSync({ silent: true });
}

function render() {
  $('#loginView').classList.add('hidden');
  $('#adminApp').classList.remove('hidden');
  $('#viewTitle').textContent = titles[state.view];

  const hasEditor = Boolean(configs[state.view]);
  $('#newButton').classList.toggle('hidden', !hasEditor);

  if (hasEditor) {
    $('#newButton').textContent = `Yeni ${singularTitles[state.view] || 'Kayıt'}`;
  }

  document.querySelectorAll('#adminNav button').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === state.view);
  });

  if (state.view === 'dashboard') {
    renderDashboard();
  } else if (state.view === 'settings') {
    renderSettings();
  } else if (state.view === 'users') {
    renderUsers();
  } else {
    renderTable(state.view);
  }
}

function renderDashboard() {
  const counts = state.data.counts;
  const openai = state.data.integrations?.openai || {};
  const persistentDataPathConfigured = Boolean(
    state.data.integrations?.persistentDataPathConfigured
  );
  const labels = {
    products: 'Ürün',
    stores: 'Mağaza',
    offers: 'Teklif',
  ads: 'Reklam',
    campaigns: 'Kampanya',
    coupons: 'Kupon',
    clicks: 'Mağaza tıklaması'
  };

  $('#adminContent').innerHTML = `
    <div class="stat-grid">
      ${Object.entries(counts)
        .map(
          ([key, value]) => `
            <div class="stat-card">
              <small>${labels[key] || esc(key)}</small>
              <b>${value}</b>
            </div>
          `
        )
        .join('')}
    </div>

    <div class="dash-grid">
      <div class="admin-panel">
        <div class="panel-head">
          <h2>Son fiyat güncellemeleri</h2>
        </div>
        ${syncTable(state.data.collections.syncLogs.slice(0, 8))}
      </div>

      <div class="sync-card">
        <span class="eyebrow">OPENAI FİYAT RADARI</span>
        <h3>Gerçek fiyat ve stok kontrolü</h3>
        <p>
          ChatGPT web araması doğrudan ürün sayfalarını inceler. Yalnızca doğrulanan fiyatları
          kaydeder; stokta olmayan teklifleri vitrinden kaldırır.
        </p>
        <div class="integration-state ${openai.configured ? 'ready' : 'missing'}">
          <i></i>
          <span>${openai.configured
            ? `${esc(openai.model)} hızlı mod hazır`
            : 'OPENAI_API_KEY tanımlı değil'}</span>
        </div>
        ${persistentDataPathConfigured ? '' : `
          <div class="storage-warning">
            Pro kayıtlarının restart sonrası korunması için <code>ARDUFIYAT_DATA_DIR</code>
            kalıcı diske bağlanmalı.
          </div>
        `}
        <div class="sync-actions">
          <button class="primary-btn" id="dashOpenAISync" data-default-label="ChatGPT ile Hızlı Yenile">ChatGPT ile Hızlı Yenile</button>
          <button class="secondary-btn" id="dashSync">CSV Dosyasını İşle</button>
        </div>
        <div id="openaiSyncProgress" class="gemini-progress hidden"></div>
      </div>
    </div>
  `;

  $('#dashSync').onclick = refreshOffers;
  $('#dashOpenAISync').onclick = refreshOffersWithOpenAI;
  updateGeminiControls();
}

function renderTable(collection) {
  if (collection === 'syncLogs') {
    $('#adminContent').innerHTML = `
      <div class="admin-panel">
        <div class="panel-head">
          <h2>Senkron kayıtları</h2>
        </div>
        ${syncTable(state.data.collections.syncLogs)}
      </div>
    `;
    return;
  }

  const rows = state.data.collections[collection] || [];
  const columns = {
    products: ['name', 'sku', 'brand', 'categoryId', 'active'],
    stores: ['name', 'domain', 'integrationMode', 'active'],
    offers: ['productId', 'storeId', 'price', 'stock', 'verifiedAt', 'active'],
    ads: ['title', 'sponsor', 'placement', 'clicks', 'active'],
    campaigns: ['name', 'badge', 'active'],
    banners: ['title', 'theme', 'order', 'active'],
    coupons: ['code', 'storeId', 'expiresAt', 'active']
  }[collection];

  const refreshButton = collection === 'offers'
    ? '<button class="secondary-btn compact-btn" id="tableRefreshOffers">CSV Yenile</button><button class="primary-btn compact-btn" id="tableOpenAISync" data-default-label="ChatGPT ile Hızlı Yenile">ChatGPT ile Hızlı Yenile</button>'
    : '';

  $('#adminContent').innerHTML = `
    <div class="admin-panel">
      <div class="panel-head">
        <h2>${titles[collection]}</h2>
        <div class="panel-actions">
          <small>${rows.length} kayıt</small>
          ${refreshButton}
        </div>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              ${columns.map((column) => `<th>${label(column)}</th>`).join('')}
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length
              ? rows
                  .map(
                    (row) => `
                      <tr>
                        ${columns
                          .map((column) => `<td>${cell(collection, column, row[column])}</td>`)
                          .join('')}
                        <td>
                          <div class="row-actions">
                            <button data-edit="${row.id}">Düzenle</button>
                            <button class="danger" data-delete="${row.id}">Sil</button>
                          </div>
                        </td>
                      </tr>
                    `
                  )
                  .join('')
              : `<tr><td colspan="${columns.length + 1}" class="empty-table">Henüz kayıt yok.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-edit]').forEach((button) => {
    button.onclick = () => {
      const item = rows.find((row) => row.id === button.dataset.edit);
      openEditor(collection, item);
    };
  });

  document.querySelectorAll('[data-delete]').forEach((button) => {
    button.onclick = () => removeItem(collection, button.dataset.delete);
  });

  $('#tableRefreshOffers')?.addEventListener('click', refreshOffers);
  $('#tableOpenAISync')?.addEventListener('click', refreshOffersWithOpenAI);
  updateGeminiControls();
}

function syncTable(rows) {
  if (!rows.length) {
    return '<div class="empty-table">Henüz güncelleme kaydı yok.</div>';
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Tetikleyici</th>
            <th>Durum</th>
            <th>Aktarılan</th>
            <th>Atlanan</th>
            <th>Not</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${date(row.finishedAt)}</td>
                  <td>${esc(row.trigger)}</td>
                  <td>
                    <span class="status-pill ${row.status === 'success' ? '' : 'off'}">
                      ${esc(row.status)}
                    </span>
                  </td>
                  <td>${row.imported}</td>
                  <td>${row.skipped}</td>
                  <td>${esc(row.note || '')}</td>
                </tr>
              `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function label(column) {
  return ({
    name: 'Ad',
    sku: 'SKU',
    brand: 'Marka',
    categoryId: 'Kategori',
    active: 'Durum',
    domain: 'Alan adı',
    integrationMode: 'Entegrasyon',
    productId: 'Ürün',
    storeId: 'Mağaza',
    price: 'Fiyat',
    stock: 'Stok',
    verifiedAt: 'Doğrulama',
    badge: 'Rozet',
    title: 'Başlık',
    theme: 'Tema',
    order: 'Sıra',
    code: 'Kod',
    expiresAt: 'Bitiş',
    sponsor: 'Sponsor',
    placement: 'Alan',
    clicks: 'Tıklama'
  })[column] || column;
}

function cell(collection, key, value) {
  if (key === 'active') {
    return `<span class="status-pill ${value ? '' : 'off'}">${value ? 'Aktif' : 'Pasif'}</span>`;
  }

  if (key === 'price') return money(value);

  if (key === 'categoryId') {
    return esc(
      state.data.collections.categories.find((item) => item.id === value)?.name || value
    );
  }

  if (key === 'productId') {
    return esc(
      state.data.collections.products.find((item) => item.id === value)?.name || value
    );
  }

  if (key === 'storeId') {
    return esc(
      state.data.collections.stores.find((item) => item.id === value)?.name || value
    );
  }

  if (key.includes('At') || key === 'expiresAt') return date(value);

  return esc(value ?? '—');
}

function date(value) {
  return value ? new Date(value).toLocaleString('tr-TR') : '—';
}

function renderUsers() {
  const users = state.data.collections.users || [];
  $('#adminContent').innerHTML = `
    <div class="admin-panel">
      <div class="panel-head"><h2>Kullanıcılar</h2><small>${users.length} kayıt</small></div>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>Ad</th><th>E-posta</th><th>Plan</th><th>Pro bitiş</th><th>Kayıt</th><th>Durum</th><th>İşlem</th></tr></thead>
        <tbody>${users.length ? users.map((user) => `
          <tr>
            <td>${esc(user.name)}</td><td>${esc(user.email)}</td>
            <td><span class="status-pill ${user.isPro ? '' : 'off'}">${user.isPro ? 'PRO' : 'Ücretsiz'}</span></td>
            <td>${user.proExpiresAt ? date(user.proExpiresAt) : (user.isPro ? 'Süresiz' : '—')}</td>
            <td>${date(user.createdAt)}</td>
            <td><span class="status-pill ${user.active !== false ? '' : 'off'}">${user.active !== false ? 'Aktif' : 'Pasif'}</span></td>
            <td><div class="row-actions">
              ${user.isPro ? `<button class="danger" data-revoke-pro="${user.id}">Pro Kaldır</button>` : `<button data-grant-pro="${user.id}">Pro Yap</button>`}
              <button data-toggle-user="${user.id}" data-active="${user.active !== false}">${user.active !== false ? 'Pasifleştir' : 'Aktifleştir'}</button>
            </div></td>
          </tr>`).join('') : '<tr><td colspan="7" class="empty-table">Henüz kullanıcı kaydı yok.</td></tr>'}</tbody>
      </table></div>
    </div>`;

  document.querySelectorAll('[data-grant-pro]').forEach((button) => button.onclick = async () => {
    const value = prompt('Pro bitiş tarihi (YYYY-MM-DD). Süresiz için boş bırak:');
    if (value === null) return;
    let expiresAt = null;
    if (value.trim()) {
      const parsed = new Date(`${value.trim()}T23:59:59`);
      if (Number.isNaN(parsed.getTime())) return toast('Tarih geçersiz.');
      expiresAt = parsed.toISOString();
    }
    await api(`/api/admin/users/${button.dataset.grantPro}/pro`, { method:'PUT', body: JSON.stringify({ enabled:true, expiresAt }) });
    toast('Kullanıcı Pro yapıldı.'); await load();
  });
  document.querySelectorAll('[data-revoke-pro]').forEach((button) => button.onclick = async () => {
    if (!confirm('Bu kullanıcının Pro erişimi kaldırılsın mı?')) return;
    await api(`/api/admin/users/${button.dataset.revokePro}/pro`, { method:'PUT', body: JSON.stringify({ enabled:false }) });
    toast('Pro erişimi kaldırıldı.'); await load();
  });
  document.querySelectorAll('[data-toggle-user]').forEach((button) => button.onclick = async () => {
    const active = button.dataset.active !== 'true';
    await api(`/api/admin/users/${button.dataset.toggleUser}/status`, { method:'PUT', body: JSON.stringify({ active }) });
    toast('Kullanıcı durumu güncellendi.'); await load();
  });
}

function renderSettings() {
  const settings = state.data.settings;

  $('#adminContent').innerHTML = `
    <form id="settingsForm" class="settings-grid">
      <div class="setting-card">
        <label>Site adı</label>
        <input name="siteName" value="${esc(settings.siteName)}">
      </div>
      <div class="setting-card">
        <label>Site sloganı</label>
        <input name="siteTagline" value="${esc(settings.siteTagline)}">
      </div>
      <div class="setting-card">
        <label>Ücretsiz teklif limiti</label>
        <input name="freeOfferLimit" type="number" value="${settings.freeOfferLimit}">
      </div>
      <div class="setting-card">
        <label>Pro teklif limiti (0 = bütün teklifler)</label>
        <input name="proOfferLimit" type="number" min="0" value="${settings.proOfferLimit}">
      </div>
      <div class="setting-card">
        <label>Bayat veri eşiği (saat)</label>
        <input name="staleHours" type="number" value="${settings.staleHours}">
      </div>
      <div class="setting-card">
        <label>Reklamlar</label>
        <select name="adsEnabled">
          <option value="true" ${settings.adsEnabled !== false ? 'selected' : ''}>Açık</option>
          <option value="false" ${settings.adsEnabled === false ? 'selected' : ''}>Kapalı</option>
        </select>
      </div>
      <div class="setting-card">
        <label>Ürün ızgarası reklam sıklığı</label>
        <input name="adFrequency" type="number" min="2" value="${settings.adFrequency || 8}">
      </div>
      <div class="setting-card">
        <label>Para birimi</label>
        <input name="currency" value="${esc(settings.currency)}">
      </div>
      <div class="setting-card" style="grid-column: 1 / -1">
        <label>Veri politikası metni</label>
        <textarea name="dataPolicyText">${esc(settings.dataPolicyText)}</textarea>
      </div>
      <div class="settings-actions">
        <button class="primary-btn">Ayarları Kaydet</button>
      </div>
    </form>
  `;

  $('#settingsForm').onsubmit = saveSettings;
}

function openEditor(collection, item = null) {
  const isNew = !item;
  const draft = item ? { ...item } : { active: true };

  if (isNew && collection === 'stores') {
    draft.integrationMode = 'manual_verified';
  }

  if (isNew && collection === 'offers') {
    draft.stock = 'in_stock';
    draft.shipping = 'Mağazada hesaplanır';
    draft.sourceType = 'manual_verified';
    draft.verifiedAt = new Date().toISOString();
  }

  if (isNew && collection === 'banners') {
    draft.theme = 'orange';
  }

  state.editing = {
    collection,
    item: draft,
    isNew
  };

  $('#editorEyebrow').textContent = isNew ? 'YENİ KAYIT' : 'KAYDI DÜZENLE';
  $('#editorTitle').textContent = isNew
    ? `Yeni ${singularTitles[collection].toLocaleLowerCase('tr-TR')}`
    : `${singularTitles[collection]} kaydını düzenle`;
  $('#editorFields').innerHTML = configs[collection].fields
    .map((field) => fieldHtml(field, draft, collection))
    .join('');
  $('#editorMessage').textContent = '';
  $('#editorDialog').showModal();

  $('#editorFields').querySelectorAll('[data-image-box]').forEach((box) => {
    const fileInput = box.querySelector('input[type="file"]');
    const hiddenInput = box.querySelector('input[type="hidden"]');
    const preview = box.querySelector('[data-image-preview]');
    const clearButton = box.querySelector('[data-clear-image]');

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        fileInput.value = '';
        toast('Fotoğraf en fazla 5 MB olabilir.');
        return;
      }
      const localUrl = URL.createObjectURL(file);
      preview.innerHTML = `<img class="editor-image-preview" src="${localUrl}" alt="Teklif fotoğrafı önizlemesi">`;
    });

    clearButton?.addEventListener('click', () => {
      fileInput.value = '';
      hiddenInput.value = '';
      preview.innerHTML = '<div class="editor-image-placeholder">Fotoğraf seçilmedi</div>';
    });
  });
}

function fieldHtml([name, title, type, width, options], item, collection) {
  let value = item?.[name] ?? '';
  const full = width === 'full' ? 'full' : '';
  const requiredFields = {
    products: ['name', 'sku', 'categoryId'],
    stores: ['name', 'domain'],
    offers: ['productId', 'storeId', 'price', 'url']
  };
  const required = requiredFields[collection]?.includes(name) ? 'required' : '';

  if (type === 'checkbox') {
    return `
      <div class="editor-field ${full}">
        <label class="checkbox-row">
          <input name="${name}" type="checkbox" ${value ? 'checked' : ''}>
          ${title}
        </label>
      </div>
    `;
  }

  if (type === 'textarea') {
    return `
      <div class="editor-field ${full}">
        <label>${title}</label>
        <textarea name="${name}" ${required}>${esc(value)}</textarea>
      </div>
    `;
  }

  if (type === 'select') {
    return `
      <div class="editor-field ${full}">
        <label>${title}</label>
        <select name="${name}" ${required}>
          ${options
            .map(
              (option) => `
                <option value="${esc(option)}" ${option === value ? 'selected' : ''}>
                  ${esc(option)}
                </option>
              `
            )
            .join('')}
        </select>
      </div>
    `;
  }

  if (type === 'image-upload') {
    const preview = value
      ? `<img class="editor-image-preview" src="${esc(value)}" alt="Teklif fotoğrafı önizlemesi">`
      : '<div class="editor-image-placeholder">Fotoğraf seçilmedi</div>';

    return `
      <div class="editor-field ${full} image-upload-field">
        <label>${title}</label>
        <div class="editor-image-box" data-image-box>
          <div data-image-preview>${preview}</div>
          <input name="${name}" type="hidden" value="${esc(value)}">
          <input name="${name}File" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
          <div class="image-upload-actions">
            <button type="button" class="secondary-btn" data-clear-image>Fotoğrafı kaldır</button>
          </div>
          <small>JPG, PNG, WEBP veya GIF. En fazla 5 MB.</small>
        </div>
      </div>
    `;
  }

  if (type === 'category' || type === 'product' || type === 'store') {
    const optionsMap = {
      category: state.data.collections.categories,
      product: state.data.collections.products,
      store: state.data.collections.stores
    };
    const records = optionsMap[type] || [];

    return `
      <div class="editor-field ${full}">
        <label>${title}</label>
        <select name="${name}" ${required}>
          ${records
            .map(
              (record) => `
                <option value="${record.id}" ${record.id === value ? 'selected' : ''}>
                  ${esc(record.name)}
                </option>
              `
            )
            .join('')}
        </select>
      </div>
    `;
  }

  if (type === 'tags') {
    value = Array.isArray(value) ? value.join(', ') : value;
  }

  if (type === 'datetime-local' && value) {
    value = new Date(value).toISOString().slice(0, 16);
  }

  const numberAttributes = type === 'number'
    ? `step="${name === 'price' ? '0.01' : '1'}" ${name === 'price' ? 'min="0.01"' : ''}`
    : '';

  return `
    <div class="editor-field ${full}">
      <label>${title}</label>
      <input
        name="${name}"
        type="${type}"
        value="${esc(value)}"
        ${required}
        ${numberAttributes}
      >
    </div>
  `;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Fotoğraf okunamadı.'));
    reader.readAsDataURL(file);
  });
}

async function saveEditor(event) {
  event.preventDefault();

  const { collection, item, isNew } = state.editing;
  const formData = new FormData(event.target);
  const body = {};

  for (const [name, , type] of configs[collection].fields) {
    let value = formData.get(name);

    if (type === 'image-upload') {
      const file = formData.get(`${name}File`);
      if (file instanceof File && file.size > 0) {
        const base64 = await fileToBase64(file);
        const uploaded = await api('/api/admin/upload-image', {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type,
            data: base64
          })
        });
        value = uploaded.url;
      }
    }

    if (type === 'checkbox') value = formData.has(name);
    if (type === 'number') value = Number(value);
    if (type === 'tags') {
      value = String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    if (type === 'datetime-local' && value) value = new Date(value).toISOString();

    body[name] = value;
  }

  try {
    const result = await api(
      isNew
        ? `/api/admin/${collection}`
        : `/api/admin/${collection}/${item.id}`,
      {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(body)
      }
    );

    $('#editorDialog').close();

    if (collection === 'stores') {
      toast('Mağaza kaydedildi. Şimdi Teklifler bölümünden bu mağazaya fiyat ekleyin.');
    } else if (collection === 'offers') {
      toast(
        result?.updatedExisting
          ? 'Bu ürün ve mağazanın mevcut teklifi güncellendi.'
          : 'Teklif kaydedildi ve ana siteye eklendi.'
      );
      state.view = 'offers';
    } else {
      toast('Kayıt kaydedildi.');
    }

    await load();
  } catch (error) {
    $('#editorMessage').textContent = error.message;
  }
}

async function removeItem(collection, id) {
  if (!confirm('Bu kayıt silinsin mi?')) return;

  await api(`/api/admin/${collection}/${id}`, { method: 'DELETE' });
  toast('Kayıt silindi.');
  await load();
}

async function saveSettings(event) {
  event.preventDefault();

  const body = Object.fromEntries(new FormData(event.target));
  ['freeOfferLimit', 'proOfferLimit', 'staleHours', 'adFrequency'].forEach((key) => {
    body[key] = Number(body[key]);
  });

  body.adsEnabled = body.adsEnabled === 'true';

  await api('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(body)
  });

  toast('Ayarlar güncellendi.');
  await load();
}

async function refreshOffers() {
  const buttons = [
    $('#syncButton'),
    $('#dashSync'),
    $('#tableRefreshOffers')
  ].filter(Boolean);

  const previousLabels = buttons.map((button) => button.textContent);

  buttons.forEach((button) => {
    button.disabled = true;
    button.classList.add('loading');
    button.textContent = 'Yenileniyor…';
  });

  try {
    const result = await api('/api/admin/offers/refresh', {
      method: 'POST',
      body: '{}'
    });

    await load();

    if (result.imported > 0) {
      toast(`${result.imported} teklif güncellendi. Toplam ${result.activeOfferCount} aktif teklif var.`);
    } else {
      toast(`Teklif listesi yenilendi. ${result.activeOfferCount} aktif teklif var.`);
    }
  } catch (error) {
    toast(error.message);
  } finally {
    buttons.forEach((button, index) => {
      button.disabled = false;
      button.classList.remove('loading');
      button.textContent = previousLabels[index];
    });
  }
}

function geminiButtons() {
  return [
    $('#openaiSyncButton'),
    $('#dashOpenAISync'),
    $('#tableOpenAISync')
  ].filter(Boolean);
}

function terminalGeminiStatus(status) {
  return ['completed', 'completed_with_warnings', 'failed'].includes(status);
}

function geminiSummary(job) {
  if (!job || job.status === 'idle') return 'Henüz OpenAI güncellemesi başlatılmadı.';
  if (job.status === 'running') {
    return `${job.processed || 0}/${job.total || 0} teklif kontrol edildi · ${job.priceChanged || 0} fiyat değişti · ${job.deactivated || 0} stok dışı teklif gizlendi`;
  }
  const error = Array.isArray(job.errors) && job.errors[0] ? ` · Hata: ${job.errors[0]}` : '';
  return `${job.priceChanged || 0} fiyat değişti · ${job.deactivated || 0} stok dışı teklif gizlendi · ${job.reactivated || 0} teklif yeniden açıldı · ${job.skipped || 0} teklif atlandı${error}`;
}

function updateGeminiControls(job = null) {
  const configured = Boolean(state.data?.integrations?.openai?.configured);
  const running = job?.status === 'running';

  geminiButtons().forEach((button) => {
    const defaultLabel = button.dataset.defaultLabel || 'ChatGPT ile Hızlı Yenile';
    button.disabled = running;
    button.title = configured
      ? 'Ürün sayfalarını OpenAI web aramasıyla hızlı modda kontrol eder.'
      : 'Render Environment bölümüne OPENAI_API_KEY ekleyin.';
    button.textContent = running
      ? `OpenAI ${job.processed || 0}/${job.total || 0}`
      : defaultLabel;
  });

  const progress = $('#openaiSyncProgress');
  if (progress) {
    progress.classList.toggle('hidden', !job || job.status === 'idle');
    progress.classList.toggle('warning', job?.status === 'completed_with_warnings' || job?.status === 'failed');
    progress.innerHTML = job && job.status !== 'idle'
      ? `<b>${job.status === 'running' ? 'Kontrol sürüyor' : 'Son kontrol'}</b><span>${esc(geminiSummary(job))}</span>`
      : '';
  }
}

function scheduleGeminiPoll() {
  clearTimeout(state.geminiPollTimer);
  state.geminiPollTimer = setTimeout(() => {
    void pollGeminiSync();
  }, 1800);
}

async function pollGeminiSync({ silent = false } = {}) {
  if (!state.token || !state.data?.integrations?.openai?.configured) {
    updateGeminiControls();
    return;
  }

  try {
    const { job } = await api('/api/admin/offers/openai-refresh');
    updateGeminiControls(job);

    if (job.status === 'running') {
      state.geminiWasRunning = true;
      scheduleGeminiPoll();
      return;
    }

    if (state.geminiWasRunning && terminalGeminiStatus(job.status)) {
      state.geminiWasRunning = false;
      toast(geminiSummary(job));
      state.data = await api('/api/admin/dashboard');
      render();
      updateGeminiControls(job);
    }
  } catch (error) {
    if (!silent) toast(error.message);
  }
}

async function refreshOffersWithOpenAI() {
  const offerCount = Number(state.data?.counts?.offers || 0);
  if (!confirm(`${offerCount} teklif ChatGPT hızlı mod ile kontrol edilecek. Bu işlem API kotası kullanır. Devam edilsin mi?`)) {
    return;
  }

  try {
    toast('OpenAI bağlantısı kontrol ediliyor...');
    const { job } = await api('/api/admin/offers/openai-refresh', {
      method: 'POST',
      body: '{}'
    });
    state.geminiWasRunning = true;
    updateGeminiControls(job);
    toast('OpenAI fiyat ve stok kontrolü hızlı modda başladı.');
    scheduleGeminiPoll();
  } catch (error) {
    toast(error.message);
  }
}

async function syncImages(force = false) {
  const button = $('#imageSyncButton');
  const previous = button.textContent;

  button.disabled = true;
  button.classList.add('loading');
  button.textContent = 'Fotoğraflar indiriliyor…';

  try {
    const result = await api('/api/admin/images/sync', {
      method: 'POST',
      body: JSON.stringify({ force })
    });

    await load();
    toast(`${result.downloaded} fotoğraf indirildi, ${result.skipped} hazır, ${result.failed} başarısız.`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.classList.remove('loading');
    button.textContent = previous;
  }
}

function toast(text) {
  const element = $('#toast');
  element.textContent = text;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 3200);
}

function logout() {
  localStorage.removeItem('arduAdminToken');
  state.token = '';
  $('#adminApp').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
}

$('#imageSyncButton').onclick = () => syncImages(false);
$('#openaiSyncButton').onclick = refreshOffersWithOpenAI;

$('#loginForm').onsubmit = async (event) => {
  event.preventDefault();
  $('#loginMessage').textContent = '';

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: $('#loginEmail').value,
        password: $('#loginPassword').value
      })
    });

    const body = await response.json();
    if (!response.ok) throw new Error(body.error);

    state.token = body.token;
    localStorage.setItem('arduAdminToken', body.token);
    await load();
  } catch (error) {
    $('#loginMessage').textContent = error.message;
  }
};

$('#adminNav').onclick = (event) => {
  const button = event.target.closest('[data-view]');
  if (!button) return;

  state.view = button.dataset.view;
  render();
};

$('#newButton').onclick = () => openEditor(state.view);
$('#syncButton').onclick = refreshOffers;
$('#logoutButton').onclick = logout;
$('#editorForm').onsubmit = saveEditor;

document.querySelectorAll('[data-close]').forEach((button) => {
  button.onclick = () => button.closest('dialog')?.close();
});

if (state.token) {
  load().catch(logout);
}
