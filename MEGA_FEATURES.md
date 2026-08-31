# ArduFiyat Mega Özellik Paketi

Bu sürüm üç katmanla çalışır:

1. `server.js`: mevcut ArduFiyat API ve ana uygulama.
2. `enhanced-server.js`: favori, alarm, fiyat geçmişi, fırsat, PWA, SEO ve ilk bot/API katmanı.
3. `mega-server.js`: sepet/BOM/proje, gerçek indirim, tahmin, uyumluluk, topluluk, merchant feed, API v2, kur/global fiyat, affiliate ve haftalık özet.

`npm start` doğrudan `mega-server.js` başlatır.

## Kullanıcı özellikleri

- Gerçek indirim analizi: son 30 gün ortalaması/medyanı ile kıyas.
- `AL / BEKLE / PAHALI` skoru ve basit 7 günlük istatistiksel fiyat tahmini.
- 90 günlük en düşük/yüksek fiyat.
- Haftanın/ayın daha avantajlı satın alma zamanı istatistiği.
- Akıllı sepet: mağazalara bölme ile tek mağazayı kargo dahil karşılaştırma.
- BOM: CSV/XLSX parça listesi eşleştirme ve en ucuz sepet hesabı.
- Hazır proje maliyet hesaplayıcı.
- Teknik özellik filtresi, SKU/model arama.
- Ürün alternatifleri ve tamamlayıcı parça önerileri.
- Temel voltaj/lojik/motor sürücü uyumluluk kontrolleri.
- Barkod/QR kamera araması (`BarcodeDetector` destekli tarayıcılarda).
- Kullanıcı teknik yorumları.
- Kullanıcı fiyat/stok bildirimi ve puan sistemi.
- Profil: şehir, ilgi alanı, haftalık özet, minimum fiyat değişimi eşikleri.
- Akıllı favori bildirimi: küçük fiyat hareketlerinde bildirim göndermez.
- ArduFiyat Elektronik Endeksi ve kategori fiyat istatistikleri.
- Türkiye’de aktif teklif yoksa “Türkiye’de bulunamadı” bilgisi.

## Otomasyon

- Gemini fiyat/stok: yaklaşık 24 saatte bir (önceki sistem).
- Akıllı favori değişim kontrolü: 3 saatte bir.
- Haftalık e-posta özeti: uygun kullanıcıları 12 saatte bir kontrol eder, kullanıcı başına yaklaşık haftada bir gönderir.
- TCMB USD/EUR/GBP kuru: 6 saatte bir yenilenir.
- Veri kalitesi/anomali taraması: önceki gelişmiş katmanda çalışmaya devam eder.

## Mağaza / merchant feed

Admin mağaza için tek kullanımlık merchant anahtarı üretir:

```http
POST /api/mega/admin/merchant-key
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{"storeId":"store_x","allowSponsored":false}
```

Mağaza feed gönderir:

```http
POST /api/mega/merchant/feed
x-merchant-key: af_merchant_...
Content-Type: application/json

{
  "items": [
    {
      "sku": "ESP32-WROOM",
      "price": 249.90,
      "stock": "in_stock",
      "url": "https://magaza.example/urun/esp32"
    }
  ]
}
```

Feed URL’sinin kayıtlı mağaza domainiyle eşleşmesi zorunludur.

Mağaza lojistiği:

```http
POST /api/mega/admin/store-logistics
Authorization: Bearer ADMIN_TOKEN

{
  "storeId":"store_x",
  "shippingBase":79.90,
  "freeShippingThreshold":1000,
  "deliveryDaysMin":1,
  "deliveryDaysMax":3,
  "deliveryByCity":{"Samsun":"1-2 iş günü","İstanbul":"1 iş günü"}
}
```

## Sponsor ve affiliate

Sponsorlu feed ancak admin mağazada `allowSponsored=true` açarsa kabul edilir. Sponsor bilgisi kullanıcıya açıkça gösterilir.

Affiliate URL varsa `/go/:offerId` yönlendirmesi affiliate adrese gider ve tıklama `affiliateClicks` içinde kayıt edilir. Gerçek affiliate anlaşması/URL’si olmadan sistem kendiliğinden gelir üretmez.

## Global fiyat karşılaştırma

TCMB kuru otomatik alınır. Global mağaza teklifi eklemek için:

```http
POST /api/mega/admin/global-offer
Authorization: Bearer ADMIN_TOKEN

{
  "productId":"product_x",
  "source":"Mouser",
  "country":"US",
  "price":12.5,
  "currency":"USD",
  "shipping":8,
  "estimatedTaxRate":0.20,
  "url":"https://..."
}
```

AliExpress/Mouser/DigiKey gibi siteler gerçek zamanlı otomatik bağlanmak için kendi resmi API/feed erişimlerini gerektirir. Bu erişimler olmadan ArduFiyat sahte canlı veri üretmez; global teklifler admin/feed üzerinden gelir.

## Gemini teknik özellik çıkarımı

```http
POST /api/mega/admin/specs/:productId
Authorization: Bearer ADMIN_TOKEN
```

Ürünün mevcut en iyi teklif URL’sini Gemini URL Context ile kontrol eder ve doğrulanabilen teknik özellikleri `product.specs` alanına kaydeder. Bilinmeyen değerleri uydurmaması için prompt kısıtlıdır.

## API v2

Kullanıcı giriş yaptıktan sonra:

```http
POST /api/mega/dev-key
Authorization: Bearer USER_TOKEN
```

Tek sefer gösterilen `af_live_...` anahtarı döner.

Salt okunur API:

```text
GET /api/v2/products?q=esp32
GET /api/v2/products/:id-veya-slug
GET /api/v2/deals
GET /api/v2/index
GET /api/v2/match?q=ESP32
```

Header:

```text
x-api-key: af_live_...
```

Anahtarsız erişim de düşük rate limit ile açıktır; istenirse `ARDUFIYAT_PUBLIC_API_KEY` tanımlanabilir.

## Tarayıcı eklentisi

`browser-extension/` klasörü Chrome/Edge Manifest V3 kaynaklarını içerir. Ürün sayfası başlığını `/api/v2/match` ile eşleştirip ArduFiyat karşılaştırmasına bağlantı verir.

## Gerekli/opsiyonel Railway Variables

```text
# Zaten kullanılanlar
DATABASE_URL=
GEMINI_API_KEY=
GEMINI_MODEL=

# E-posta ve haftalık özet
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

# Public API opsiyonel
ARDUFIYAT_PUBLIC_API_KEY=
PUBLIC_API_RATE_LIMIT=240

# Kur otomasyonu
FX_AUTO_SYNC=true
```

## Yeni ekranlar

```text
/sepet
/projeler
/bom
/akilli
/uyumluluk
/endeks
/tara
/profil
/gelistirici
/satici
/global
```

SEO marka/kategori yolları:

```text
/marka/espressif
/kategori/sensorler
```
