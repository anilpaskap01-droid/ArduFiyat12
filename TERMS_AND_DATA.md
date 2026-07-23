# Veri Kaynağı ve Kullanım Koşulları Politikası

1. Öncelik sırası: resmi mağaza API'si, affiliate/partner feed, mağaza CSV/XML beslemesi, yönetici tarafından doğrulanmış manuel kayıt.
2. HTML scraping varsayılan olarak kapalıdır (`ALLOW_HTML_FETCH=false`).
3. Bir mağaza için otomatik HTML adaptörü yazılmadan önce kullanım koşulları, robots.txt, hız limiti ve yeniden yayın izni kontrol edilmelidir.
4. Fiyat kaydında kaynak URL, doğrulama zamanı, stok durumu ve kaynak türü zorunludur.
5. Bayat veri eşiğini aşan teklifler arayüzde güncelleme gerekli olarak işaretlenir.
6. Pazar yeri fiyatları satıcıya göre değiştiği için satıcı adı ve doğrudan ürün URL'si saklanmalıdır.
7. Kargo bedeli kesin değilse sahte sayı yerine “Mağazada hesaplanır” kullanılır.
8. Üretimde mağaza başına istek limiti, hata bütçesi, tekrar deneme, circuit breaker ve gözlemlenebilirlik eklenmelidir.
