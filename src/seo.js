import { readDb, slugify } from './store.js';
import { isDirectOfferUrl } from './offer-url.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function escapeXml(value = '') {
  return String(value).replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;'
  })[character]);
}

function getOrigin(req) {
  const configured = String(
    process.env.PUBLIC_SITE_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');

  if (
    configured &&
    !configured.includes('localhost') &&
    !configured.includes('127.0.0.1')
  ) {
    return configured;
  }

  const protocol = String(
    req.headers['x-forwarded-proto'] || 'http'
  )
    .split(',')[0]
    .trim();

  const host = String(
    req.headers.host || 'localhost'
  ).trim();

  return `${protocol}://${host}`;
}

function absoluteUrl(origin, value = '') {
  const raw = String(value || '').trim();

  if (!raw) return '';

  try {
    return new URL(raw, `${origin}/`).toString();
  } catch {
    return '';
  }
}

function validPublicOffer(db, offer) {
  if (!offer?.active) return false;

  const price = Number(offer.price);

  if (!Number.isFinite(price) || price <= 0) {
    return false;
  }

  const store = db.stores.find(
    (item) => item.id === offer.storeId
  );

  if (!store?.active) return false;

  return isDirectOfferUrl(
    offer.url,
    store.domain
  );
}

function getProductOffers(db, productId) {
  const stockOrder = {
    in_stock: 0,
    low_stock: 1,
    unknown: 2,
    out_of_stock: 3
  };

  return db.offers
    .filter(
      (offer) =>
        offer.productId === productId &&
        validPublicOffer(db, offer)
    )
    .map((offer) => ({
      ...offer,
      price: Number(offer.price),
      store: db.stores.find(
        (store) => store.id === offer.storeId
      )
    }))
    .sort((a, b) => {
      const stockDifference =
        (stockOrder[a.stock] ?? 2) -
        (stockOrder[b.stock] ?? 2);

      if (stockDifference !== 0) {
        return stockDifference;
      }

      const aTotal =
        Number(a.price) +
        Number(a.shippingCost || 0);

      const bTotal =
        Number(b.price) +
        Number(b.shippingCost || 0);

      return aTotal - bTotal;
    });
}

function stockText(stock) {
  const labels = {
    in_stock: 'Stokta',
    low_stock: 'Kritik stok',
    out_of_stock: 'Tükendi',
    unknown: 'Stok bilinmiyor'
  };

  return labels[stock] || 'Stok bilinmiyor';
}

function stockSchema(stock) {
  const schemas = {
    in_stock: 'https://schema.org/InStock',
    low_stock: 'https://schema.org/LimitedAvailability',
    out_of_stock: 'https://schema.org/OutOfStock'
  };

  return schemas[stock] || undefined;
}

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return new Intl.NumberFormat(
    'tr-TR',
    {
      style: 'currency',
      currency: 'TRY'
    }
  ).format(number);
}

function productSlug(product) {
  return (
    String(product.slug || '').trim() ||
    slugify(product.name)
  );
}

function productImage(product, offers) {
  const offerImage = offers.find(
    (offer) =>
      String(offer.imageUrl || '').trim()
  )?.imageUrl;

  return String(
    offerImage ||
    product.imageUrl ||
    ''
  ).trim();
}

function renderOfferRows(offers) {
  if (!offers.length) {
    return `
      <div class="empty-offers">
        <strong>
          Şu anda aktif mağaza teklifi bulunamadı.
        </strong>

        <p>
          Bu ürün ArduFiyat kataloğunda bulunuyor.
          Yeni fiyat teklifleri eklendiğinde bu sayfada
          otomatik olarak gösterilecektir.
        </p>
      </div>
    `;
  }

  return offers
    .map((offer, index) => {
      const storeName =
        offer.store?.name ||
        'Mağaza';

      const shipping =
        String(
          offer.shipping ||
          'Mağazada hesaplanır'
        );

      return `
        <div class="offer-row">

          <div class="rank">
            ${index + 1}
          </div>

          <div class="store">
            <strong>
              ${escapeHtml(storeName)}
            </strong>

            <small>
              ${escapeHtml(
                stockText(offer.stock)
              )}
            </small>
          </div>

          <div class="shipping">
            ${escapeHtml(shipping)}
          </div>

          <div class="price">

            <strong>
              ${escapeHtml(
                money(offer.price)
              )}
            </strong>

            <a
              href="/go/${encodeURIComponent(
                offer.id
              )}"
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              Mağazaya Git ↗
            </a>

          </div>

        </div>
      `;
    })
    .join('');
}

function renderProductPage({
  req,
  db,
  product
}) {
  const origin = getOrigin(req);

  const slug = productSlug(product);

  const canonical =
    `${origin}/urun/${encodeURIComponent(slug)}`;

  const allOffers =
    getProductOffers(
      db,
      product.id
    );

  const hasOffers =
    allOffers.length > 0;

  const freeLimit = Math.max(
    1,
    Number(
      db.settings?.freeOfferLimit ?? 30
    )
  );

  const visibleOffers =
    allOffers.slice(0, freeLimit);

  const hiddenCount = Math.max(
    0,
    allOffers.length -
      visibleOffers.length
  );

  const bestOffer =
    hasOffers
      ? (
          allOffers.find(
            (offer) =>
              offer.stock !== 'out_of_stock'
          ) ||
          allOffers[0]
        )
      : null;

  const prices = allOffers
    .map((offer) =>
      Number(offer.price)
    )
    .filter(
      (price) =>
        Number.isFinite(price) &&
        price > 0
    );

  const lowPrice =
    prices.length
      ? Math.min(...prices)
      : null;

  const highPrice =
    prices.length
      ? Math.max(...prices)
      : null;

  const category =
    db.categories.find(
      (item) =>
        item.id === product.categoryId
    );

  const imageRaw =
    productImage(
      product,
      allOffers
    );

  const image =
    absoluteUrl(
      origin,
      imageRaw ||
      `/api/product-image/${encodeURIComponent(
        product.id
      )}`
    );

  const title =
    hasOffers
      ? `${product.name} Fiyatları ve Mağaza Karşılaştırma | ArduFiyat`
      : `${product.name} | Fiyat Takibi | ArduFiyat`;

  const description =
    hasOffers
      ? (
          `${product.name} fiyatlarını karşılaştır. ` +
          `${allOffers.length} mağaza teklifi arasından ` +
          `en düşük fiyat ${money(lowPrice)}. ` +
          `Güncel fiyat ve stok bilgilerini ArduFiyat'ta incele.`
        )
      : (
          `${product.name} için fiyatları ArduFiyat'ta takip et. ` +
          `Yeni mağaza teklifleri ve güncel fiyatlar eklendiğinde ` +
          `bu ürün sayfasında görüntülenecektir.`
        );

  const productSchema = {
    '@context':
      'https://schema.org',

    '@type':
      'Product',

    name:
      product.name,

    description:
      product.description ||
      description,

    sku:
      product.sku ||
      undefined,

    brand:
      product.brand
        ? {
            '@type': 'Brand',
            name: product.brand
          }
        : undefined,

    category:
      category?.name ||
      undefined,

    image:
      image
        ? [image]
        : undefined,

    url:
      canonical
  };

  if (hasOffers) {
    const schemaOffers =
      visibleOffers.map(
        (offer) => {
          const schemaOffer = {
            '@type': 'Offer',

            priceCurrency: 'TRY',

            price:
              Number(offer.price),

            url:
              `${origin}/go/${encodeURIComponent(
                offer.id
              )}`,

            seller: {
              '@type': 'Organization',

              name:
                offer.store?.name ||
                'Mağaza'
            }
          };

          const availability =
            stockSchema(
              offer.stock
            );

          if (availability) {
            schemaOffer.availability =
              availability;
          }

          return schemaOffer;
        }
      );

    productSchema.offers = {
      '@type':
        'AggregateOffer',

      priceCurrency:
        'TRY',

      lowPrice,

      highPrice,

      offerCount:
        allOffers.length,

      offers:
        schemaOffers
    };
  }

  const schemaJson =
    JSON.stringify(productSchema)
      .replace(
        /</g,
        '\\u003c'
      );

  const productDescription =
    escapeHtml(
      product.description ||
      (
        hasOffers
          ? description
          : `${product.name} için güncel mağaza fiyatları takip edilmektedir.`
      )
    );

  const categoryName =
    escapeHtml(
      category?.name ||
      'Elektronik'
    );

  const brand =
    escapeHtml(
      product.brand ||
      ''
    );

  const imageHtml =
    image
      ? `
        <img
          src="${escapeHtml(image)}"
          alt="${escapeHtml(product.name)}"
        >
      `
      : `
        <div class="fallback-image">
          ArduFiyat
        </div>
      `;

  const hiddenHtml =
    hiddenCount > 0
      ? `
        <div class="hidden-note">
          ${hiddenCount} teklif daha mevcut.
          Tüm tekliflere ArduFiyat üzerinden erişebilirsiniz.
        </div>
      `
      : '';

  const priceBoxHtml =
    bestOffer
      ? `
        <div class="best-price">

          <small>
            En düşük güncel fiyat
          </small>

          <strong>
            ${escapeHtml(
              money(
                bestOffer.price
              )
            )}
          </strong>

          <span>
            ${escapeHtml(
              bestOffer.store?.name ||
              'Mağaza'
            )}
            •
            ${escapeHtml(
              stockText(
                bestOffer.stock
              )
            )}
          </span>

        </div>
      `
      : `
        <div class="no-price-box">

          <small>
            Güncel fiyat
          </small>

          <strong>
            Henüz teklif yok
          </strong>

          <span>
            Yeni mağaza fiyatları eklendiğinde
            burada otomatik olarak gösterilecektir.
          </span>

        </div>
      `;

  return `<!doctype html>
<html lang="tr">

<head>

  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>${escapeHtml(title)}</title>

  <meta
    name="description"
    content="${escapeHtml(description)}"
  >

  <meta
    name="robots"
    content="index,follow,max-image-preview:large"
  >

  <link
    rel="canonical"
    href="${escapeHtml(canonical)}"
  >

  <meta
    property="og:type"
    content="product"
  >

  <meta
    property="og:locale"
    content="tr_TR"
  >

  <meta
    property="og:site_name"
    content="ArduFiyat"
  >

  <meta
    property="og:title"
    content="${escapeHtml(title)}"
  >

  <meta
    property="og:description"
    content="${escapeHtml(description)}"
  >

  <meta
    property="og:url"
    content="${escapeHtml(canonical)}"
  >

  ${
    image
      ? `
  <meta
    property="og:image"
    content="${escapeHtml(image)}"
  >
  `
      : ''
  }

  <script type="application/ld+json">
    ${schemaJson}
  </script>

  <style>

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #f7f8fa;
      color: #101828;
      font-family:
        Inter,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        Arial,
        sans-serif;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .topbar {
      background: #101828;
      color: #ffffff;
      padding: 11px 20px;
      text-align: center;
      font-size: 13px;
    }

    header {
      background: #ffffff;
      border-bottom: 1px solid #e8edf3;
    }

    .header-inner {
      width: min(
        1180px,
        calc(100% - 32px)
      );

      margin: auto;
      min-height: 72px;

      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 21px;
      font-weight: 850;
    }

    .brand-mark {
      width: 38px;
      height: 38px;
      border-radius: 12px;

      display: grid;
      place-items: center;

      background: #ff6b20;
      color: #ffffff;
    }

    .home-link {
      padding: 11px 15px;
      border-radius: 12px;
      border: 1px solid #e8edf3;
      font-size: 13px;
      font-weight: 750;
      background: #ffffff;
    }

    .shell {
      width: min(
        1180px,
        calc(100% - 32px)
      );

      margin: auto;
    }

    .breadcrumb {
      padding: 25px 0 16px;
      color: #667085;
      font-size: 13px;
    }

    .breadcrumb a {
      color: #ff6b20;
    }

    .product {
      display: grid;

      grid-template-columns:
        minmax(280px, 430px)
        1fr;

      gap: 38px;

      background: #ffffff;

      border:
        1px solid #e8edf3;

      border-radius: 25px;

      padding: 28px;

      box-shadow:
        0 18px 55px
        rgba(16, 24, 40, .06);
    }

    .image-box {
      min-height: 380px;

      border-radius: 20px;

      background: #f7f8fa;

      display: grid;
      place-items: center;

      overflow: hidden;

      padding: 22px;
    }

    .image-box img {
      display: block;
      max-width: 100%;
      max-height: 390px;
      object-fit: contain;
    }

    .fallback-image {
      font-size: 42px;
      font-weight: 900;
      color: #ff6b20;
    }

    .eyebrow {
      display: inline-block;

      color: #ff6b20;

      font-size: 12px;
      font-weight: 900;

      letter-spacing: .12em;

      margin-bottom: 12px;
    }

    h1 {
      margin: 0;

      font-size:
        clamp(
          34px,
          5vw,
          54px
        );

      line-height: 1.03;
      letter-spacing: -.045em;
    }

    .description {
      margin:
        20px 0 24px;

      color: #667085;

      font-size: 16px;
      line-height: 1.7;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;

      margin-bottom: 25px;
    }

    .meta span {
      padding: 8px 11px;

      border-radius: 999px;

      background: #f5f7fa;

      font-size: 12px;
      font-weight: 700;
    }

    .best-price {
      padding: 22px;

      border:
        1px solid #ffd5bc;

      border-radius: 18px;

      background: #fff7f2;
    }

    .best-price small {
      display: block;
      color: #667085;
      margin-bottom: 5px;
    }

    .best-price strong {
      display: block;
      color: #ff6b20;
      font-size: 34px;
    }

    .best-price span {
      display: block;

      color: #667085;

      margin-top: 7px;

      font-size: 12px;
    }

    .no-price-box {
      padding: 22px;

      border:
        1px solid #e8edf3;

      border-radius: 18px;

      background: #f8fafc;
    }

    .no-price-box small {
      display: block;
      color: #667085;
      margin-bottom: 5px;
    }

    .no-price-box strong {
      display: block;
      color: #344054;
      font-size: 27px;
    }

    .no-price-box span {
      display: block;

      color: #667085;

      margin-top: 8px;

      font-size: 12px;
      line-height: 1.5;
    }

    .offers {
      margin-top: 32px;

      background: #ffffff;

      border:
        1px solid #e8edf3;

      border-radius: 24px;

      padding: 26px;

      margin-bottom: 60px;
    }

    .offers-head {
      display: flex;

      align-items: center;
      justify-content: space-between;

      gap: 20px;

      margin-bottom: 20px;
    }

    .offers-head h2 {
      margin: 0;
      font-size: 25px;
    }

    .offers-head span {
      color: #667085;
      font-size: 13px;
    }

    .offer-row {
      display: grid;

      grid-template-columns:
        40px
        minmax(150px, 1fr)
        minmax(140px, .8fr)
        minmax(170px, .8fr);

      gap: 15px;

      align-items: center;

      padding: 15px 0;

      border-bottom:
        1px solid #edf0f4;
    }

    .offer-row:last-child {
      border-bottom: 0;
    }

    .rank {
      width: 34px;
      height: 34px;

      border-radius: 10px;

      background: #f5f7fa;

      display: grid;
      place-items: center;

      font-size: 12px;
      font-weight: 900;
    }

    .store strong {
      display: block;
    }

    .store small {
      display: block;
      color: #667085;
      margin-top: 5px;
    }

    .shipping {
      color: #667085;
      font-size: 13px;
    }

    .price {
      text-align: right;
    }

    .price strong {
      display: block;
      font-size: 18px;
    }

    .price a {
      display: inline-block;

      margin-top: 7px;

      background: #ff6b20;
      color: #ffffff;

      padding: 9px 12px;

      border-radius: 10px;

      font-size: 12px;
      font-weight: 800;
    }

    .hidden-note {
      margin-top: 16px;

      padding: 14px 16px;

      background: #f5f7fa;

      border-radius: 12px;

      color: #667085;

      font-size: 13px;
    }

    .empty-offers {
      padding: 34px 20px;
      text-align: center;
      color: #667085;
      background: #f8fafc;
      border-radius: 16px;
    }

    .empty-offers strong {
      display: block;
      color: #344054;
      font-size: 18px;
    }

    .empty-offers p {
      margin:
        8px auto 0;

      max-width: 560px;

      line-height: 1.6;

      font-size: 13px;
    }

    .source-note {
      margin-top: 22px;

      color: #667085;

      font-size: 12px;
      line-height: 1.6;
    }

    footer {
      border-top:
        1px solid #e8edf3;

      background: #ffffff;

      padding: 25px;

      text-align: center;

      color: #667085;

      font-size: 12px;
    }

    @media (
      max-width: 760px
    ) {

      .product {
        grid-template-columns: 1fr;
        padding: 18px;
      }

      .image-box {
        min-height: 280px;
      }

      .offer-row {
        grid-template-columns:
          34px 1fr;

        align-items: start;
      }

      .shipping {
        grid-column: 2;
      }

      .price {
        grid-column: 2;
        text-align: left;
      }

      .offers {
        padding: 18px;
      }

      .offers-head {
        display: block;
      }

      .offers-head span {
        display: block;
        margin-top: 8px;
      }

    }

  </style>

</head>

<body>

  <div class="topbar">
    Arduino ve elektronik fiyat karşılaştırma
  </div>

  <header>

    <div class="header-inner">

      <a
        class="brand"
        href="/"
      >
        <span class="brand-mark">
          A
        </span>

        <span>
          ArduFiyat
        </span>
      </a>

      <a
        class="home-link"
        href="/"
      >
        Tüm ürünler
      </a>

    </div>

  </header>

  <main class="shell">

    <div class="breadcrumb">

      <a href="/">
        ArduFiyat
      </a>

      &nbsp;›&nbsp;

      ${categoryName}

      &nbsp;›&nbsp;

      ${escapeHtml(product.name)}

    </div>

    <article class="product">

      <div class="image-box">
        ${imageHtml}
      </div>

      <div>

        <span class="eyebrow">
          ${categoryName}
        </span>

        <h1>
          ${escapeHtml(product.name)}
        </h1>

        <p class="description">
          ${productDescription}
        </p>

        <div class="meta">

          ${
            brand
              ? `
                <span>
                  Marka: ${brand}
                </span>
              `
              : ''
          }

          ${
            product.sku
              ? `
                <span>
                  SKU:
                  ${escapeHtml(
                    product.sku
                  )}
                </span>
              `
              : ''
          }

          <span>
            ${
              hasOffers
                ? `${allOffers.length} mağaza teklifi`
                : 'Fiyat takibinde'
            }
          </span>

        </div>

        ${priceBoxHtml}

      </div>

    </article>

    <section class="offers">

      <div class="offers-head">

        <h2>
          ${escapeHtml(product.name)}
          fiyatları
        </h2>

        <span>
          ${
            hasOffers
              ? `${allOffers.length} teklif bulundu`
              : 'Henüz teklif yok'
          }
        </span>

      </div>

      ${renderOfferRows(
        visibleOffers
      )}

      ${hiddenHtml}

      <div class="source-note">
        Fiyat, stok, kargo ve varyant bilgileri
        mağazalarda değişebilir.
        Satın almadan önce mağazadaki
        güncel bilgileri kontrol edin.
      </div>

    </section>

  </main>

  <footer>
    © ArduFiyat — Elektronik fiyat karşılaştırma
  </footer>

</body>

</html>`;
}

function renderSitemap({
  req,
  db
}) {
  const origin = getOrigin(req);

  const urls = [];

  urls.push({
    loc: `${origin}/`,
    lastmod:
      db.meta?.updatedAt ||
      ''
  });

  for (const product of db.products) {
    // SADECE aktif ürün şartı var.
    // Teklif olup olmamasına artık bakmıyoruz.
    if (!product?.active) {
      continue;
    }

    const slug =
      productSlug(product);

    if (!slug) {
      continue;
    }

    urls.push({
      loc:
        `${origin}/urun/` +
        `${encodeURIComponent(slug)}`,

      lastmod:
        product.updatedAt ||
        product.createdAt ||
        db.meta?.updatedAt ||
        ''
    });
  }

  const entries =
    urls.map(
      ({ loc, lastmod }) => {

        let dateLine = '';

        if (lastmod) {
          const date =
            new Date(lastmod);

          if (
            !Number.isNaN(
              date.getTime()
            )
          ) {
            dateLine =
              `\n    <lastmod>` +
              `${date.toISOString()}` +
              `</lastmod>`;
          }
        }

        return `  <url>
    <loc>${escapeXml(loc)}</loc>${dateLine}
  </url>`;
      }
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

export function getSeoResponse(
  req,
  url
) {
  if (
    req.method !== 'GET' &&
    req.method !== 'HEAD'
  ) {
    return null;
  }

  if (
    url.pathname === '/sitemap.xml'
  ) {
    const db = readDb();

    return {
      status: 200,

      body:
        renderSitemap({
          req,
          db
        }),

      headers: {
        'Content-Type':
          'application/xml; charset=utf-8',

        'Cache-Control':
          'public, max-age=1800'
      }
    };
  }

  const match =
    url.pathname.match(
      /^\/urun\/([^/]+)\/?$/
    );

  if (!match) {
    return null;
  }

  let requestedSlug;

  try {
    requestedSlug =
      decodeURIComponent(
        match[1]
      );
  } catch {
    return {
      status: 400,

      body:
        'Geçersiz ürün adresi.',

      headers: {
        'Content-Type':
          'text/plain; charset=utf-8'
      }
    };
  }

  const db = readDb();

  const product =
    db.products.find(
      (item) => {
        if (!item?.active) {
          return false;
        }

        return (
          productSlug(item) ===
          requestedSlug
        );
      }
    );

  if (!product) {
    return {
      status: 404,

      body:
        `<!doctype html>
<html lang="tr">

<head>

  <meta charset="utf-8">

  <meta
    name="robots"
    content="noindex"
  >

  <title>
    Ürün bulunamadı | ArduFiyat
  </title>

</head>

<body>

  <h1>
    Ürün bulunamadı
  </h1>

  <p>
    <a href="/">
      ArduFiyat ana sayfasına dön
    </a>
  </p>

</body>

</html>`,

      headers: {
        'Content-Type':
          'text/html; charset=utf-8',

        'Cache-Control':
          'no-cache'
      }
    };
  }

  const page =
    renderProductPage({
      req,
      db,
      product
    });

  return {
    status: 200,

    body: page,

    headers: {
      'Content-Type':
        'text/html; charset=utf-8',

      'Cache-Control':
        'public, max-age=300'
    }
  };
}
