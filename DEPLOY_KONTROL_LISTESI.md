# Deploy Kontrol Listesi

## Render build ayarları

- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/api/health`

## Pro ve kullanıcı kayıtlarının kalıcı olması

Render'ın geçici dosya sistemi restart ve deploy sırasında sıfırlanır. Persistent disk
destekleyen bir servis planında:

1. Servise kalıcı disk ekleyin.
2. Mount path değerini `/var/data` yapın.
3. Environment bölümüne `ARDUFIYAT_DATA_DIR=/var/data` ekleyin.
4. Deploy sonrasında `/api/health` yanıtındaki
   `persistentDataPathConfigured` değerinin `true` olduğunu kontrol edin.

Kalıcı disk eklenmeden önce kaybolan kullanıcılar otomatik geri getirilemez. İlk kalıcı
deploy sonrasında kullanıcı hesabını ve Pro yetkisini bir kez yeniden oluşturun.

## Gemini fiyat ve stok kontrolü

Environment bölümüne gerçek değerleri yalnızca Render üzerinden ekleyin:

```text
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
GEMINI_PRICE_BATCH_SIZE=8
GEMINI_PRICE_BATCH_DELAY_MS=350
```

Admin panelindeki **Gemini ile Fiyatları Yenile** düğmesi yalnızca doğrudan ürün
sayfalarını kontrol eder. Erişilemeyen veya güvenle doğrulanamayan teklifleri değiştirmez.
Stok dışı doğrulanan teklif yalnızca ilgili ürünün mağaza listesinde pasifleşir.

## Gizli değerler

Aşağıdaki değerleri kaynak koda veya ZIP içindeki `.env` dosyasına yazmayın:

```text
ADMIN_EMAIL=
ADMIN_PASSWORD=
TOKEN_SECRET=
SMTP_USER=
SMTP_PASS=
GOOGLE_CLIENT_ID=
GEMINI_API_KEY=
```
