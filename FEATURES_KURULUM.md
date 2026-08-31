# ArduFiyat Gelişmiş Özellikler

Bu sürüm `enhanced-server.js` katmanını kullanır. Mevcut `server.js` iç serviste çalışmaya devam eder; yeni katman kullanıcı takibi, fiyat alarmı, fiyat geçmişi, fırsatlar, PWA, SEO, public API ve bot uçlarını ekler.

## Otomatik çalışanlar

- Gemini fiyat/stok taraması: `AUTO_GEMINI_DAILY_SYNC=true` varsayılanıyla yaklaşık 24 saatte bir.
- Fiyat/stok alarmları: saatte bir kontrol.
- Veri kalite/anomali taraması: 6 saatte bir.
- PostgreSQL varsa tüm favori, alarm, rapor ve kalite kayıtları `app_state/main` içinde kalıcıdır.

## Opsiyonel bildirim değişkenleri

E-posta için mevcut SMTP değişkenleri kullanılır:

```text
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

Telegram için:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
```

Webhook adresi:

```text
https://SITE_ADRESI/api/bot/telegram
```

Kullanıcı sitede Telegram bağlantı kodu üretir ve botta `/bagla KOD` komutunu gönderir. Bot komutları: `/fiyat ESP32`, `/stok Arduino Uno`, `/firsatlar`.

Discord için iki seçenek vardır. Alarm bildirimlerini bir kanala göndermek için:

```text
DISCORD_ALERT_WEBHOOK_URL=
```

Slash command endpoint'i için:

```text
DISCORD_PUBLIC_KEY=
```

Interactions Endpoint URL:

```text
https://SITE_ADRESI/api/bot/discord
```

Desteklenen komut adları: `fiyat` (string option adı `urun`) ve `firsatlar`.

## Public API

Varsayılan salt okunur uçlar:

```text
GET /api/v1/products
GET /api/v1/products?q=esp32
GET /api/v1/products/:id-veya-slug
GET /api/v1/deals
```

İstenirse API anahtarı zorunlu yapılır:

```text
ARDUFIYAT_PUBLIC_API_KEY=
PUBLIC_API_RATE_LIMIT=120
```

İstemci `x-api-key` header'ı gönderir.

## SEO ve PWA

Dinamik ürün sayfası biçimi:

```text
/arduino-uno-r3-fiyatlari
```

`sitemap.xml` ürünlere göre dinamik üretilir. PWA manifest ve service worker otomatik olarak ana sayfalara eklenir.

## Pro limitleri

- Ücretsiz: 5 favori, 1 aktif alarm, 90 gün fiyat geçmişi.
- Pro: 200 favori, 100 aktif alarm, 365 gün fiyat geçmişi.

Bu limitler `enhanced-server.js` içindeki `featureLimits()` fonksiyonundan değiştirilebilir.
