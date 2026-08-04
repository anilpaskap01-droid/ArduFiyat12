# Ürün görsel kaynakları

Ürün fotoğrafları doğrudan tarayıcıda hotlink edilmez. `npm run images` komutu veya admin panelindeki **Fotoğrafları İndir** işlemi, ürünün `imageSourceUrl` alanını ve ürüne bağlı teklif URL'lerini sırayla kontrol eder. Bulunan görsel fiziksel olarak aşağıdaki klasöre kaydedilir:

```text
public/images/products/
```

Veritabanındaki `imageUrl` alanı daha sonra `/images/products/prd_....png` benzeri yerel bir adrese dönüştürülür. `imageSourceUrl` alanı kaynak ürün sayfasını korur.

Mağaza ürün görselleri üçüncü taraf içeriğidir. Siteyi yayımlamadan önce ilgili mağaza veya hak sahibinden gerekli kullanım iznini alın.
