const adminFeatureState = { active: false, health: null };
const a$ = (selector, root = document) => root.querySelector(selector);
const a$$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const aEsc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const adminToken = () => localStorage.getItem('arduAdminToken') || '';

async function adminFeatureApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      authorization: `Bearer ${adminToken()}`,
      ...(options.body ? { 'content-type': 'application/json' } : {})
    },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'İşlem başarısız.');
  return payload;
}

function aToast(message) {
  const toast = a$('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(aToast.timer);
  aToast.timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function statusClass(value) {
  return value ? 'health-ok' : 'health-warn';
}

function fmtDate(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime()) ? date.toLocaleString('tr-TR') : '—';
}

function renderHealth() {
  const health = adminFeatureState.health;
  const content = a$('#adminContent');
  if (!health || !content) return;
  content.innerHTML = `
    <div class="admin-feature-view">
      <div class="health-grid">
        <div class="health-card"><small>PostgreSQL</small><b class="${statusClass(health.database.postgres)}">${health.database.postgres ? 'Çalışıyor' : 'Kapalı'}</b><span>Kalıcı veri deposu</span></div>
        <div class="health-card"><small>Gemini</small><b class="${statusClass(health.gemini.configured)}">${health.gemini.configured ? 'Hazır' : 'Eksik'}</b><span>${aEsc(health.gemini.model || '')} • ${aEsc(health.gemini.jobStatus || '')}</span></div>
        <div class="health-card"><small>Aktif alarmlar</small><b>${health.counts.activeAlerts}</b><span>${health.counts.favorites} favori kaydı</span></div>
        <div class="health-card"><small>Veri kalitesi</small><b class="${health.counts.openQualityFlags ? 'health-warn' : 'health-ok'}">${health.counts.openQualityFlags}</b><span>${health.counts.staleOffers} eski doğrulamalı teklif</span></div>
      </div>
      <div class="health-card">
        <h3>Servisler</h3>
        <div class="system-badges">
          <span class="${statusClass(health.notifications.smtp)}">E-posta ${health.notifications.smtp ? '✓' : '—'}</span>
          <span class="${statusClass(health.notifications.telegram)}">Telegram ${health.notifications.telegram ? '✓' : '—'}</span>
          <span class="${statusClass(health.notifications.discordWebhook || health.notifications.discordBot)}">Discord ${(health.notifications.discordWebhook || health.notifications.discordBot) ? '✓' : '—'}</span>
          <span class="health-ok">Public API ✓</span>
          <span>${health.publicApi.apiKeyRequired ? 'API anahtarı zorunlu' : 'API açık'}</span>
        </div>
        <p>Son senkron: ${aEsc(fmtDate(health.gemini.lastSync?.finishedAt || health.gemini.lastSync?.startedAt))}</p>
      </div>
      <div class="health-card">
        <div class="section-head"><div><span class="eyebrow">KULLANICI GERİ BİLDİRİMİ</span><h3>Açık yanlış fiyat / stok bildirimleri</h3></div><b>${health.counts.openReports}</b></div>
        ${health.reports?.length ? `<div class="compare-table-wrap"><table class="feature-admin-table"><thead><tr><th>Tarih</th><th>Tür</th><th>Ürün / teklif</th><th>Not</th><th></th></tr></thead><tbody>${health.reports.map((report) => `<tr><td>${aEsc(fmtDate(report.createdAt))}</td><td>${aEsc(report.type)}</td><td>${aEsc(report.productId)}<br><small>${aEsc(report.offerId || '')}</small></td><td>${aEsc(report.message || '—')}</td><td><div class="feature-admin-actions"><button data-resolve-report="${aEsc(report.id)}">Çözüldü</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p>Açık kullanıcı bildirimi yok.</p>'}
      </div>
      <div class="health-card">
        <div class="section-head"><div><span class="eyebrow">ANOMALİ KUYRUĞU</span><h3>Şüpheli fiyatlar</h3></div><b>${health.counts.openQualityFlags}</b></div>
        ${health.qualityFlags?.length ? `<div class="compare-table-wrap"><table class="feature-admin-table"><thead><tr><th>Tarih</th><th>Teklif</th><th>Fiyat</th><th>Referans</th><th>Durum</th><th></th></tr></thead><tbody>${health.qualityFlags.map((flag) => `<tr><td>${aEsc(fmtDate(flag.createdAt))}</td><td>${aEsc(flag.offerId)}<br><small>${aEsc(flag.productId)}</small></td><td><b>${Number(flag.currentPrice || 0).toLocaleString('tr-TR')} ₺</b></td><td>Medyan ${Number(flag.medianPrice || 0).toLocaleString('tr-TR')} ₺<br><small>Önceki fark %${aEsc(flag.previousDeltaPct || 0)}</small></td><td>${flag.held ? '<span class="health-warn">Yayından çekildi</span>' : 'İnceleme bekliyor'}</td><td><div class="feature-admin-actions"><button class="approve" data-quality-action="approve" data-quality-id="${aEsc(flag.id)}">Onayla</button><button class="reject" data-quality-action="reject" data-quality-id="${aEsc(flag.id)}">Reddet</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p>Şüpheli fiyat kaydı yok.</p>'}
      </div>
      <div class="health-card"><small>Sistem görüntüsü</small><p>${health.counts.products} ürün • ${health.counts.offers} teklif • ${health.counts.users} kullanıcı • ${fmtDate(health.generatedAt)}</p></div>
    </div>`;

  a$$('[data-resolve-report]', content).forEach((button) => button.addEventListener('click', async () => {
    try {
      await adminFeatureApi(`/api/features/admin/reports/${encodeURIComponent(button.dataset.resolveReport)}/resolve`, { method: 'POST' });
      aToast('Bildirim çözüldü olarak işaretlendi.');
      await loadHealth();
    } catch (error) { aToast(error.message); }
  }));
  a$$('[data-quality-action]', content).forEach((button) => button.addEventListener('click', async () => {
    try {
      await adminFeatureApi(`/api/features/admin/quality/${encodeURIComponent(button.dataset.qualityId)}/${button.dataset.qualityAction}`, { method: 'POST' });
      aToast(button.dataset.qualityAction === 'approve' ? 'Fiyat onaylandı.' : 'Teklif kalite nedeniyle pasif bırakıldı.');
      await loadHealth();
    } catch (error) { aToast(error.message); }
  }));
}

async function loadHealth() {
  if (!adminToken()) return;
  try {
    adminFeatureState.health = await adminFeatureApi('/api/features/admin/health');
    if (adminFeatureState.active) renderHealth();
  } catch (error) {
    if (adminFeatureState.active) aToast(error.message);
  }
}

function addHealthNav() {
  const nav = a$('#adminNav');
  if (!nav || a$('#systemHealthNav')) return;
  const button = document.createElement('button');
  button.id = 'systemHealthNav';
  button.type = 'button';
  button.innerHTML = '♥ Sistem Sağlığı';
  nav.appendChild(button);
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    adminFeatureState.active = true;
    a$$('#adminNav button').forEach((item) => item.classList.toggle('active', item === button));
    const title = a$('#viewTitle');
    if (title) title.textContent = 'Sistem Sağlığı';
    const newButton = a$('#newButton');
    if (newButton) newButton.classList.add('hidden');
    const content = a$('#adminContent');
    if (content) content.innerHTML = '<div class="health-card">Sistem verileri yükleniyor…</div>';
    await loadHealth();
  });
  a$$('#adminNav button:not(#systemHealthNav)').forEach((item) => item.addEventListener('click', () => { adminFeatureState.active = false; }));
}

function initAdminFeatures() {
  const observer = new MutationObserver(() => {
    addHealthNav();
    if (adminFeatureState.active && adminFeatureState.health) renderHealth();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  addHealthNav();
  setInterval(() => loadHealth(), 60_000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAdminFeatures);
else initAdminFeatures();
