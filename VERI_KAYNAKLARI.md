# Veri ve Görsel Kaynakları

Bu proje bir demo/başlangıç paketidir. Fiyatlar 22 Temmuz 2026 tarihinde erişilebilen mağaza ürün sayfalarından manuel olarak kaydedilmiş anlık görüntülerdir.

## Katalog

Veri dosyalarında 32 ürün, 20 mağaza/satıcı ve 87 teklif bulunur. Her teklif şu alanları taşır:

- kaynak mağaza ürün bağlantısı
- fiyat
- stok durumu
- kargo notu
- doğrulama zamanı
- kaynak türü

Yeni eklenen ürün grupları arasında ESP32-CAM, HC-05, DHT22, BMP280, MQ-2 modülü, MPU6050, LM2596, A4988, 4 kanallı röle, DS18B20, 28BYJ-48 seti, MG996R, Raspberry Pi Pico W ve Arduino Pro Mini bulunur.

## Görseller

Tarayıcı uzak CDN adresini doğrudan açmaz. `/api/product-image/:id` uç noktası mağaza ürün sayfasındaki `og:image` adresini bulur, uygun `Referer` başlığıyla indirir ve `data/image-cache` klasörüne kaydeder. Böylece WitCDN gibi hotlink koruması kullanan kaynaklarda görülen “HOTLINK IMAGE NOT FOUND” resmi engellenir.

Görsel telif ve kullanım koşulları kaynak mağazaya/üreticiye aittir. Canlı yayında yazılı izin alın veya lisanslı görselleri kendi depolamanıza taşıyın.

## Otomatik güncelleme politikası

Öncelik sırası:

1. Resmî API
2. Affiliate/partner feed
3. Mağazanın izinli CSV/XML beslemesi
4. Manuel doğrulama

Kullanım koşullarında açık izin yoksa toplu HTML scraping etkinleştirilmemelidir.
