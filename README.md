# ArduFiyat

Arduino ve elektronik ürünler için market tarzı fiyat karşılaştırma uygulaması.

## Özellikler

- 79 ürün, 24 mağaza ve doğrulanmış doğrudan ürün teklifleri
- Ücretsiz planda ürün başına ilk **30 teklif**
- Pro planda ürüne ait **bütün teklifler**
- E-posta ve şifre ile kullanıcı kaydı/girişi
- Yönetici panelinden kullanıcıya kodsuz Pro erişimi verme veya kaldırma
- Pro kullanıcılar için reklamsız kullanım
- Admin panelinden Gemini URL Context ile doğrudan ürün fiyatı ve stok doğrulama
- Yönetilebilir üst banner, ürün ızgarası ve footer reklam alanları
- Reklam tıklama sayacı
- Ürün, mağaza, teklif, stok, kampanya, banner ve kupon yönetimi
- Admin panelinden teklif ve ürün fotoğrafı yenileme

## Kurulum

Windows PowerShell içinde:

```powershell
npm.cmd install
npm.cmd start
```

Site: `http://localhost:4173`

Admin paneli: `http://localhost:4173/admin`

Ortam değişkenleri yerel sistemden veya Render Environment bölümünden sağlanır; `.env` dosyaları deploy edilmez.

## Testler

```powershell
npm.cmd test
npm.cmd run test:links
```

`test:links`; boş/geçersiz URL, arama veya liste sayfası, mağaza alan adı
uyuşmazlığı, yönlendirme sonrası geçersiz hedef ve HTTP hata durumlarını raporlar.
Yalnızca çevrimdışı veri kontrolü için `npm.cmd run test:links -- --skip-http`
kullanılabilir.

## Kullanıcı hesabı ve Pro verme

1. Ana sitede **Giriş Yap → Kayıt Ol** bölümünden kullanıcı hesabı oluştur.
2. Admin panelinde **Kullanıcılar** bölümüne gir.
3. İlgili hesabın yanındaki **Pro Yap** düğmesine bas.
4. Bitiş tarihi yaz veya süresiz Pro için alanı boş bırak.
5. Kullanıcı sayfayı yenilediğinde bütün teklifler açılır ve reklamlar kapanır.

Pro anahtarı veya demo kodu kullanılmaz.

## Gemini ile fiyat ve stok yenileme

1. Google AI Studio üzerinden Gemini API anahtarı oluşturun.
2. Render **Environment** bölümüne `GEMINI_API_KEY` değerini ekleyin.
3. Varsayılan model `gemini-3.6-flash` olarak kullanılır.
4. Admin panelinde **Gemini ile Fiyat/Stok Yenile** düğmesine basın.

Gemini yalnızca kayıtlı doğrudan ürün detay URL'lerini URL Context ile inceler. Ürün
eşleşmesi, sayfa erişimi, TRY fiyatı ve güven seviyesi doğrulanmadan veriyi değiştirmez.
Arama sayfasından veya benzer üründen fiyat üretmez. Açıkça stokta olmadığı yüksek
güvenle doğrulanan teklif pasif yapılır ve ana sitede görünmez; mağazanın diğer ürünleri
silinmez. Ürün yeniden stoğa girerse sonraki kontrol teklifi tekrar etkinleştirebilir.

Giriş gerektiren, erişimi engelleyen veya Gemini tarafından okunamayan sayfalar atlanır.
İşlem Gemini API kotası kullanır ve teklif sayısına göre birkaç dakika sürebilir.

Gemini URL Context belgesi: https://ai.google.dev/gemini-api/docs/url-context

## Reklam yönetimi

Admin panelindeki **Reklamlar** bölümünden reklam ekleyebilir, düzenleyebilir ve kapatabilirsin.

Gösterim alanları:

- `top_banner`: ana bölümün altındaki yatay reklam
- `product_grid`: ürün kartları arasındaki reklam
- `footer_banner`: sayfa sonundaki yatay reklam

Görsel alanı boş bırakılabilir. Yerel görsel için dosyayı `public/images/ads` içine koyup `/images/ads/dosya.jpg` şeklinde kullan.

## Admin giriş bilgileri

`ADMIN_EMAIL`, `ADMIN_PASSWORD` ve `TOKEN_SECRET` değerlerini yalnızca yerel `.env`
dosyanızda veya Render environment variables bölümünde tanımlayın. Gerçek değerleri
kaynak koda eklemeyin.

```text
ADMIN_EMAIL=
ADMIN_PASSWORD=
TOKEN_SECRET=
```

## Ürün fotoğrafları

```powershell
npm.cmd run images
npm.cmd run images:force
```

Fotoğraflar `public/images/products` klasörüne kaydedilir.

## Render'da kullanıcı ve Pro verilerini kalıcı tutma

Render servislerinin varsayılan dosya sistemi geçicidir. Kullanıcı hesapları, Pro
yetkileri ve admin değişikliklerinin yeniden başlatma veya yeni deploy sonrasında
korunması için:

> Render kalıcı diskleri persistent disk destekleyen ücretli web servislerinde kullanılabilir.
> Ücretsiz ve geçici dosya sisteminde JSON verisi restart sonrasında kalıcı tutulamaz.

1. Render servisinde **Disks → Add Disk** bölümünden kalıcı disk ekleyin.
2. Disk mount path değerini `/var/data` yapın.
3. Render **Environment** bölümüne `ARDUFIYAT_DATA_DIR=/var/data` ekleyin.
4. Servisi yeniden deploy edin.
5. `/api/health` yanıtında `persistentDataPathConfigured: true` olduğunu doğrulayın.

Uygulama ilk açılışta mevcut `data/db.json` dosyasını `/var/data/db.json` konumuna
taşır; bu dosya yoksa seed verisiyle oluşturur. Daha sonraki başlatmalarda aynı dosyayı
kullanır ve seed güncellemeleri kullanıcı veya Pro kayıtlarını silmez. Kalıcı disk
eklenmeden önce geçici diskte kaybolmuş kayıtlar geri getirilemez; ilk kalıcı deploy
sonrasında bu kullanıcılara Pro yetkisini bir kez yeniden verin.

Render persistent disk belgesi: https://render.com/docs/disks

## Üretim notu

Bu sürüm tek sunucu için kalıcı diskte JSON dosyası kullanabilir. Birden fazla sunucu
örneği veya yüksek trafik için PostgreSQL/MySQL, HTTPS, şifre sıfırlama, hız sınırlama
ve düzenli yedekleme kullanılmalıdır.


## Ücretsiz Pro
Discord botu kullanılmaz. Kullanıcı sunucuya katıldıktan sonra admin panelindeki Kullanıcılar bölümünden manuel olarak Pro yapılır. Davet: https://discord.gg/gT96uAfuA
