# ArduFiyat

Arduino ve elektronik ürünler için market tarzı fiyat karşılaştırma uygulaması.

## Özellikler

- 32 ürün, 20 mağaza ve örnek teklif verileri
- Ücretsiz planda ürün başına ilk **30 teklif**
- Pro planda ürüne ait **bütün teklifler**
- E-posta ve şifre ile kullanıcı kaydı/girişi
- Yönetici panelinden kullanıcıya kodsuz Pro erişimi verme veya kaldırma
- Pro kullanıcılar için reklamsız kullanım
- Yönetilebilir üst banner, ürün ızgarası ve footer reklam alanları
- Reklam tıklama sayacı
- Ürün, mağaza, teklif, stok, kampanya, banner ve kupon yönetimi
- Admin panelinden teklif ve ürün fotoğrafı yenileme

## Kurulum

Windows PowerShell içinde:

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd start
```

Site: `http://localhost:4173`

Admin paneli: `http://localhost:4173/admin`

## Kullanıcı hesabı ve Pro verme

1. Ana sitede **Giriş Yap → Kayıt Ol** bölümünden kullanıcı hesabı oluştur.
2. Admin panelinde **Kullanıcılar** bölümüne gir.
3. İlgili hesabın yanındaki **Pro Yap** düğmesine bas.
4. Bitiş tarihi yaz veya süresiz Pro için alanı boş bırak.
5. Kullanıcı sayfayı yenilediğinde bütün teklifler açılır ve reklamlar kapanır.

Pro anahtarı veya demo kodu kullanılmaz.

## Reklam yönetimi

Admin panelindeki **Reklamlar** bölümünden reklam ekleyebilir, düzenleyebilir ve kapatabilirsin.

Gösterim alanları:

- `top_banner`: ana bölümün altındaki yatay reklam
- `product_grid`: ürün kartları arasındaki reklam
- `footer_banner`: sayfa sonundaki yatay reklam

Görsel alanı boş bırakılabilir. Yerel görsel için dosyayı `public/images/ads` içine koyup `/images/ads/dosya.jpg` şeklinde kullan.

## Admin giriş bilgileri

`.env` dosyasında tanımlıdır:

```text
ADMIN_EMAIL=anilpaskap01@gmail.com
ADMIN_PASSWORD=Kinqmos12
```

## Ürün fotoğrafları

```powershell
npm.cmd run images
npm.cmd run images:force
```

Fotoğraflar `public/images/products` klasörüne kaydedilir.

## Üretim notu

Bu sürüm yerel geliştirme için JSON dosyası kullanır. Canlı ve çok kullanıcılı yayında PostgreSQL/MySQL, HTTPS, e-posta doğrulama, şifre sıfırlama, hız sınırlama ve düzenli yedekleme eklenmelidir.


## Ücretsiz Pro
Discord botu kullanılmaz. Kullanıcı sunucuya katıldıktan sonra admin panelindeki Kullanıcılar bölümünden manuel olarak Pro yapılır. Davet: https://discord.gg/gT96uAfuA
