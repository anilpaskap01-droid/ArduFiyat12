const state = {
  data: null,
  q: '',
  category: 'all',
  sort: 'featured',
  plan: 'free',
  loading: false,
  authMode: 'login',
  pendingVerificationEmail: ''
};

const $ = (selector) => document.querySelector(selector);

const money = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'Fiyat bulunamadı';

  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY'
  }).format(number);
};

const icons = {
  cpu: '⌘',
  radar: '◉',
  monitor: '▣',
  zap: 'ϟ',
  blocks: '⬡',
  wrench: '⌁',
  processor: '▦', gpu: '▤', motherboard: '▧', memory: '▥', storage: '◫', power: 'ϟ', case: '▣', cooling: '❄',
  mouse: '◒', keyboard: '⌨', headset: '◉', wheel: '◉', gamepad: '✦', microphone: '♬', webcam: '◉', laptop: '▰', network: '⌁'
};

const stockLabel = {
  in_stock: 'Stokta',
  out_of_stock: 'Tükendi',
  low_stock: 'Kritik stok',
  unknown: 'Stok bilinmiyor'
};

function userToken() {
  return localStorage.getItem('arduUserToken') || '';
}

async function load({ silent = false } = {}) {
  if (state.loading) return;
  state.loading = true;

  try {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);

    const token = userToken();
    const response = await fetch(`/api/bootstrap?${params}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      cache: 'no-store'
    });

    if (!response.ok) throw new Error('Ürünler yüklenemedi.');

    state.data = await response.json();
    state.plan = state.data.plan;

    if (token && !state.data.user) {
      localStorage.removeItem('arduUserToken');
    }

    render();
  } catch (error) {
    if (!silent) toast(error.message);
  } finally {
    state.loading = false;
  }
}

function render() {
  const { data } = state;

  $('#verifiedCount').textContent = data.meta.verifiedOfferCount;
  $('#dataPolicy').textContent = data.settings.dataPolicyText;

  const bestPrice = data.products
    .map((product) => product.bestPrice)
    .filter((price) => Number.isFinite(Number(price)) && Number(price) > 0)
    .sort((a, b) => a - b)[0];

  $('#heroPrice').textContent = bestPrice ? money(bestPrice) : '—';
  $('#proButton').textContent = state.plan === 'pro' ? 'PRO AKTİF' : 'PRO';
  $('#accountButton').textContent = data.user
    ? `${data.user.name.split(' ')[0]}${data.user.isPro ? ' • PRO' : ''}`
    : 'Giriş Yap';

  renderCategories();
  renderStores();
  renderProducts();
  renderAds();
}

function renderCategories() {
  const categories = [
    { id: 'all', slug: 'all', name: 'Tümü', icon: 'blocks' },
    ...state.data.categories
  ];

  $('#categoryGrid').innerHTML = categories
    .map((category) => {
      const productCount = category.slug === 'all'
        ? state.data.products.length
        : state.data.products.filter(
            (product) => product.category?.slug === category.slug
          ).length;

      return `
        <button
          class="category-card ${state.category === category.slug ? 'active' : ''}"
          data-category="${escapeHtml(category.slug)}"
        >
          <span>${icons[category.icon] || '◈'}</span>
          <b>${escapeHtml(category.name)}</b>
          <small>${productCount} fiyatlı ürün</small>
        </button>
      `;
    })
    .join('');

  document.querySelectorAll('[data-category]').forEach((button) => {
    button.onclick = () => {
      state.category = button.dataset.category;
      load();
    };
  });
}

function renderStores() {
  const stores = state.data.stores || [];
  const grid = $('#storeGrid');

  if (!grid) return;

  grid.innerHTML = stores.length
    ? stores
        .map(
          (store) => {
            const storeUrl = store.domain
              ? `https://${String(store.domain).replace(/^https?:\/\//i, '').replace(/\/$/, '')}`
              : '#';
            return `
            <a class="store-card" href="${escapeHtml(storeUrl)}" target="_blank" rel="noopener noreferrer">
              <span class="store-logo">
                ${escapeHtml(store.logoText || store.name.slice(0, 2).toUpperCase())}
              </span>
              <div>
                <b>${escapeHtml(store.name)}</b>
                <small>${escapeHtml(store.domain || 'Mağaza')}</small>
              </div>
              <em>${Number(store.offerCount || 0)} teklif</em>
            </a>
          `;
          }
        )
        .join('')
    : '<div class="empty-stores">Henüz aktif mağaza eklenmedi.</div>';
}

function productArt(product) {
  const shortName = product.name.split(' ').slice(0, 3).join(' ');
  const configuredImage = String(product.displayImageUrl || product.imageUrl || '').trim();
  const hasImageSource = String(product.displayImageUrl || product.imageUrl || product.imageSourceUrl || '').trim();

  if (hasImageSource) {
    const version = encodeURIComponent(product.updatedAt || product.imageDownloadedAt || '1');
    const imageUrl = configuredImage.startsWith('/images/')
      ? `${configuredImage}?v=${version}`
      : product.displayImageUrl && configuredImage
        ? configuredImage
        : `/api/product-image/${encodeURIComponent(product.id)}?v=${version}`;

    return `
      <div class="product-art product-photo-wrap">
        <img
          class="product-photo"
          src="${escapeHtml(imageUrl)}"
          alt="${escapeHtml(product.name)}"
          loading="lazy"
          decoding="async"
          onerror="this.closest('.product-art').classList.add('image-error'); this.remove();"
        >
        <span class="photo-fallback">${escapeHtml(shortName)}</span>
      </div>
    `;
  }

  const symbol = product.imageKey === 'sensor'
    ? '◉'
    : product.imageKey === 'display'
      ? '▣'
      : product.imageKey === 'motor'
        ? 'ϟ'
        : '⌘';

  return `
    <div class="product-art art-${escapeHtml(product.imageKey || 'board')}">
      <span>${symbol}</span>
      <small>${escapeHtml(shortName)}</small>
    </div>
  `;
}

function productCard(product) {
  const stale = product.bestOffer &&
    (Date.now() - new Date(product.bestOffer.verifiedAt).getTime()) / 36e5 >
      state.data.settings.staleHours;

  return `
    <article class="product-card" data-product="${escapeHtml(product.id)}">
      <div class="product-badges">
        <span>${escapeHtml(product.category?.name || 'Elektronik')}</span>
        <em>${product.offerCount} teklif</em>
      </div>

      ${productArt(product)}

      <div class="product-info">
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.description || '')}</p>

        <div class="price-row">
          <div>
            <small>En düşük</small>
            <strong>${money(product.bestPrice)}</strong>
          </div>
          <span class="store-mini">
            ${escapeHtml(product.bestOffer?.store?.logoText || product.bestOffer?.store?.name?.slice(0, 2) || '')}
          </span>
        </div>

        <div class="card-meta">
          <span>${stockLabel[product.bestOffer?.stock] || 'Stok bilinmiyor'}</span>
          <span>${stale ? 'Güncelleme gerekli' : 'Doğrulandı'}</span>
        </div>

        <button class="compare-btn">Teklifleri Karşılaştır →</button>
      </div>
    </article>
  `;
}

function adArtwork(ad) {
  const imageUrl = String(ad.imageUrl || '').trim();
  if (!imageUrl) return '<div class="ad-symbol">AD</div>';

  return `
    <img
      class="ad-image"
      src="${escapeHtml(imageUrl)}"
      alt=""
      loading="lazy"
      onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';"
    >
    <div class="ad-symbol" style="display:none">AD</div>
  `;
}

function adCard(ad, variant = 'grid') {
  return `
    <a class="ad-card ad-${escapeHtml(variant)}" href="/ad/${encodeURIComponent(ad.id)}" target="_blank" rel="noopener sponsored">
      <div class="ad-visual">${adArtwork(ad)}</div>
      <div class="ad-copy">
        <span class="ad-label">REKLAM • ${escapeHtml(ad.sponsor || 'Sponsor')}</span>
        <h3>${escapeHtml(ad.title)}</h3>
        <p>${escapeHtml(ad.description || '')}</p>
        <b>İncele ↗</b>
      </div>
    </a>
  `;
}

function renderProducts() {
  let products = [...state.data.products];

  if (state.sort === 'price-asc') {
    products.sort((a, b) => Number(a.bestPrice) - Number(b.bestPrice));
  }

  if (state.sort === 'offers-desc') {
    products.sort((a, b) => b.offerCount - a.offerCount);
  }

  if (state.sort === 'name') {
    products.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  $('#activeFilters').innerHTML = `
    <span class="filter-chip">
      ${state.plan === 'pro'
        ? 'Pro: bütün teklifler • reklamsız'
        : `Ücretsiz: ${state.data.settings.freeOfferLimit} teklife kadar`}
    </span>
    ${state.q ? `<span class="filter-chip">Arama: ${escapeHtml(state.q)}</span>` : ''}
  `;

  $('#emptyState').classList.toggle('hidden', products.length > 0);

  if (!products.length) {
    $('#emptyState h3').textContent = state.q
      ? 'Fiyatlı ürün bulunamadı'
      : 'Henüz fiyatı olan ürün yok';
    $('#emptyState p').textContent = state.q
      ? 'Arama kelimesini veya kategoriyi değiştir.'
      : 'Admin panelinden ürüne aktif bir mağaza teklifi ekle.';
  }

  const gridAds = state.plan === 'free'
    ? (state.data.ads || []).filter((ad) => ad.placement === 'product_grid')
    : [];
  const frequency = Math.max(2, Number(state.data.settings.adFrequency || 8));
  const html = [];
  let adIndex = 0;

  products.forEach((product, index) => {
    html.push(productCard(product));

    if (gridAds.length && (index + 1) % frequency === 0) {
      html.push(adCard(gridAds[adIndex % gridAds.length], 'grid'));
      adIndex += 1;
    }
  });

  $('#productGrid').innerHTML = html.join('');

  document.querySelectorAll('[data-product]').forEach((card) => {
    card.onclick = () => openProduct(card.dataset.product);
  });
}

function renderAds() {
  const ads = state.plan === 'free' ? state.data.ads || [] : [];
  const topAd = ads.find((ad) => ad.placement === 'top_banner');
  const footerAd = ads.find((ad) => ad.placement === 'footer_banner');

  $('#topAdSection').classList.toggle('hidden', !topAd);
  $('#footerAdSection').classList.toggle('hidden', !footerAd);
  $('#topAdSlot').innerHTML = topAd ? adCard(topAd, 'banner') : '';
  $('#footerAdSlot').innerHTML = footerAd ? adCard(footerAd, 'banner') : '';
}

function openProduct(id) {
  const product = state.data.products.find((item) => item.id === id);
  if (!product) return;

  const offers = product.offers
    .map(
      (offer, index) => `
        <div class="offer-row ${index === 0 ? 'best' : ''}">
          <div class="offer-rank">${index + 1}</div>
          <div class="offer-store">
            <span>${escapeHtml(offer.store.logoText || offer.store.name.slice(0, 2))}</span>
            <div>
              <b>${escapeHtml(offer.store.name)}</b>
              <small>${new Date(offer.verifiedAt).toLocaleString('tr-TR')} doğrulandı</small>
            </div>
          </div>
          <div class="offer-stock ${escapeHtml(offer.stock)}">
            ${stockLabel[offer.stock] || 'Stok bilinmiyor'}
          </div>
          <div class="offer-shipping">${escapeHtml(offer.shipping || 'Mağazada hesaplanır')}</div>
          <div class="offer-price">
            <strong>${money(offer.price)}</strong>
            <a href="/go/${encodeURIComponent(offer.id)}" target="_blank" rel="noopener noreferrer sponsored" onclick="event.stopPropagation()">
              Mağazaya Git ↗
            </a>
          </div>
        </div>
      `
    )
    .join('');

  $('#productDialogContent').innerHTML = `
    <div class="dialog-product-head">
      ${productArt(product)}
      <div>
        <span class="eyebrow">${escapeHtml(product.category?.name || '')}</span>
        <h2>${escapeHtml(product.name)}</h2>
        <p>${escapeHtml(product.description || '')}</p>
        <div class="dialog-stats">
          <span><b>${product.offerCount}</b> toplam teklif</span>
          <span><b>${money(product.bestPrice)}</b> en düşük</span>
        </div>
      </div>
    </div>

    <div class="offer-head">
      <h3>Mağaza teklifleri</h3>
      <span>${state.plan === 'pro'
        ? 'Pro: bütün teklifler'
        : `Ücretsiz: ilk ${state.data.settings.freeOfferLimit} teklif`}</span>
    </div>

    <div class="offer-list">${offers}</div>

    ${product.hiddenOfferCount
      ? `<button class="locked-offers" id="lockedOffers">🔒 ${product.hiddenOfferCount} teklif daha — Pro ile aç</button>`
      : ''}

    <div class="source-note">
      Fiyat, stok ve kargo bilgisi mağazada değişebilir. Satın almadan önce kaynak sayfada yeniden kontrol edin.
    </div>
  `;

  $('#productDialog').showModal();
  $('#lockedOffers')?.addEventListener('click', openPro);
}

function setAuthMode(mode) {
  state.authMode = mode;
  const login = mode === 'login';
  $('#loginTab').classList.toggle('active', login);
  $('#registerTab').classList.toggle('active', !login);
  $('#loginUserForm').classList.toggle('hidden', !login);
  $('#registerUserForm').classList.toggle('hidden', login);
  $('#verifyEmailForm').classList.add('hidden');
  $('#googleSignIn').classList.remove('hidden');
  document.querySelector('.auth-divider')?.classList.remove('hidden');
  $('#authMessage').textContent = '';
}

function openAuth(mode = 'login') {
  setAuthMode(mode);
  $('#authDialog').showModal();
}

function openAccount() {
  const user = state.data?.user;
  if (!user) {
    openAuth('login');
    return;
  }

  $('#accountInitial').textContent = user.name.slice(0, 1).toUpperCase();
  $('#accountName').textContent = user.name;
  $('#accountEmail').textContent = user.email;
  $('#accountPlan').innerHTML = user.isPro
    ? `<b>PRO AKTİF</b><span>${user.proExpiresAt ? `${new Date(user.proExpiresAt).toLocaleDateString('tr-TR')} tarihine kadar` : 'Süresiz erişim'}</span>`
    : `<b>ÜCRETSİZ PLAN</b><span>${'Discord sunucusuna katıldıktan sonra admin panelinden Pro verilir.'}</span>`;
  $('#accountDialog').showModal();
}

function openPro() {
  const user = state.data?.user;

  if (state.plan === 'pro') {
    toast('Pro hesabın aktif. Bütün teklifler açık ve reklamlar kapalı.');
    return;
  }

  $('#paymentMessage').textContent = '';
  $('#proPlans').classList.remove('hidden');

  if (!user) {
    $('#proDialogText').textContent = 'Ücretsiz Pro için önce hesabına giriş yap.';
    $('#proPlans').classList.add('hidden');
    $('#proDialogAction').classList.remove('hidden');
    $('#proDialogAction').textContent = 'Giriş Yap';
    $('#proDialogAction').dataset.action = 'login';
  } else {
    $('#proDialogText').textContent = 'Discord sunucusuna katıl. Ardından sitedeki e-posta adresini admine bildir; admin panelinden Pro erişimi verilir.';
    $('#proDialogAction').classList.add('hidden');

  }

  $('#proDialog').showModal();
}

function closeDialogs() {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
}

function toast(text) {
  const element = $('#toast');
  element.textContent = text;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 3000);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function debounce(callback, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), wait);
  };
}

async function authRequest(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'İşlem başarısız.');
  return result;
}

$('#searchInput').addEventListener(
  'input',
  debounce((event) => {
    state.q = event.target.value.trim();
    load();
  }, 250)
);

$('#sortSelect').addEventListener('change', (event) => {
  state.sort = event.target.value;
  renderProducts();
});

['#proButton', '#heroProButton', '#bottomProButton'].forEach((selector) => {
  $(selector).onclick = openPro;
});

$('#accountButton').onclick = openAccount;
$('#loginTab').onclick = () => setAuthMode('login');
$('#registerTab').onclick = () => setAuthMode('register');

$('#loginUserForm').onsubmit = async (event) => {
  event.preventDefault();
  $('#authMessage').textContent = '';

  try {
    const result = await authRequest('/api/auth/login', {
      email: $('#userLoginEmail').value,
      password: $('#userLoginPassword').value
    });
    localStorage.setItem('arduUserToken', result.token);
    closeDialogs();
    await load();
    toast('Giriş yapıldı.');
  } catch (error) {
    $('#authMessage').textContent = error.message;
  }
};

$('#registerUserForm').onsubmit = async (event) => {
  event.preventDefault();
  $('#authMessage').textContent = '';
  try {
    const result = await authRequest('/api/auth/register', {
      name: $('#userRegisterName').value,
      email: $('#userRegisterEmail').value,
      password: $('#userRegisterPassword').value
    });
    state.pendingVerificationEmail = result.email;
    $('#loginUserForm').classList.add('hidden');
    $('#registerUserForm').classList.add('hidden');
    $('#verifyEmailForm').classList.remove('hidden');
    $('#googleSignIn').classList.add('hidden');
    document.querySelector('.auth-divider')?.classList.add('hidden');
    $('#authMessage').textContent = result.developmentCode
      ? `Geliştirme modu doğrulama kodu: ${result.developmentCode}`
      : 'Doğrulama kodu e-posta adresine gönderildi.';
    $('#emailVerificationCode').focus();
  } catch (error) { $('#authMessage').textContent = error.message; }
};

$('#verifyEmailForm').onsubmit = async (event) => {
  event.preventDefault();
  $('#authMessage').textContent = '';
  try {
    const result = await authRequest('/api/auth/verify-email', {
      email: state.pendingVerificationEmail,
      code: $('#emailVerificationCode').value
    });
    localStorage.setItem('arduUserToken', result.token);
    closeDialogs(); await load(); toast('E-posta doğrulandı, hesabın oluşturuldu.');
  } catch (error) { $('#authMessage').textContent = error.message; }
};

$('#backToRegister').onclick = () => setAuthMode('register');

async function handleGoogleCredential(response) {
  try {
    const result = await authRequest('/api/auth/google', { credential: response.credential });
    localStorage.setItem('arduUserToken', result.token);
    closeDialogs(); await load(); toast('Google hesabıyla giriş yapıldı.');
  } catch (error) { $('#authMessage').textContent = error.message; }
}

async function initGoogleSignIn() {
  try {
    const config = await fetch('/api/auth/config').then((r) => r.json());
    if (!config.googleClientId) {
      $('#googleSignIn').innerHTML = '<small>Google ile giriş yapılandırılmamış.</small>';
      return;
    }
    const wait = setInterval(() => {
      if (!window.google?.accounts?.id) return;
      clearInterval(wait);
      window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: handleGoogleCredential });
      window.google.accounts.id.renderButton($('#googleSignIn'), { theme:'outline', size:'large', shape:'rectangular', text:'continue_with', locale:'tr', width:320 });
    }, 100);
    setTimeout(() => clearInterval(wait), 10000);
  } catch { $('#googleSignIn').innerHTML = '<small>Google ile giriş yüklenemedi.</small>'; }
}

initGoogleSignIn();

$('#logoutUserButton').onclick = async () => {
  localStorage.removeItem('arduUserToken');
  closeDialogs();
  await load();
  toast('Çıkış yapıldı.');
};

$('#proDialogAction').onclick = () => {
  const action = $('#proDialogAction').dataset.action;
  $('#proDialog').close();
  if (action === 'account') openAccount();
  else openAuth('login');
};



document.querySelectorAll('[data-close]').forEach((button) => {
  button.onclick = closeDialogs;
});

document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
});

setInterval(() => load({ silent: true }), 30_000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) load({ silent: true });
});

load();
