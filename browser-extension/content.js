if (!location.hostname.includes('ardufiyat')) {
  const title = document.querySelector('h1')?.textContent?.trim() || document.title;
  chrome.runtime.sendMessage({ type: 'ARDUFIYAT_MATCH', title, url: location.href }, (response) => {
    if (!response?.ok) return;
    const match = response.data?.matches?.[0];
    if (!match?.price) return;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#18181b;color:#fff;padding:14px 16px;border-radius:14px;box-shadow:0 12px 35px rgba(0,0,0,.28);font:13px/1.4 Arial,sans-serif;max-width:290px';
    box.innerHTML = `<b style="display:block;margin-bottom:4px">ArduFiyat</b><span>${escapeHtml(match.name)}</span><strong style="display:block;font-size:18px;margin-top:4px">${formatMoney(match.price)}</strong><a href="${response.baseUrl}/?urun=${encodeURIComponent(match.id)}" target="_blank" style="color:#fff;text-decoration:underline;display:inline-block;margin-top:7px">Karşılaştır ↗</a><button aria-label="Kapat" style="position:absolute;right:7px;top:6px;border:0;background:transparent;color:#fff;font-size:18px;cursor:pointer">×</button>`;
    box.querySelector('button').onclick = () => box.remove();
    document.documentElement.appendChild(box);
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value || 0));
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
}
