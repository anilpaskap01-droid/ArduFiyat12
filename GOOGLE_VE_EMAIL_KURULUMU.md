# Google ve e-posta doğrulama kurulumu

## Gmail SMTP
1. Google hesabında iki adımlı doğrulamayı açın.
2. Bir Uygulama Şifresi oluşturun.
3. `.env` içinde `SMTP_USER` alanına Gmail adresini, `SMTP_PASS` alanına 16 karakterli uygulama şifresini yazın.

## Google ile devam et
1. Google Cloud Console içinde OAuth consent screen oluşturun.
2. OAuth Client ID türünü **Web application** seçin.
3. Authorized JavaScript origins alanına geliştirmede `http://localhost:4173`, canlıda kendi alan adınızı ekleyin.
4. Client ID değerini `.env` içindeki `GOOGLE_CLIENT_ID` alanına yazın.

Normal Gmail şifrenizi SMTP_PASS alanına yazmayın.
