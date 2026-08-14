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

function cleanOrigin(origin = '') {
  return String(origin).replace(/\/+$/, '');
}

function absoluteUrl(origin, value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    return new URL(raw, `${cleanOrigin(origin)}/`).toString();
  } catch {
    return '';
  }
}

function validDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString();
}

export function renderProductSeoPage({
  template,
  product,
  origin
}) {
  const base = cleanOrigin(origin);

  const canonical =
    `${base}/urun/${encodeURIComponent(product.slug)}`;

  const prices = (product.offers || [])
    .map((offer) => Number(offer.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  const lowPrice = prices.length
    ? Math.min(...prices)
    : null;

  const highPrice = prices.length
    ? Math.max(...prices)
    : null;

  const priceText = lowPrice
    ? `${lowPrice.toLocaleString('tr-TR')} TL`
    : '';

  const title =
    `${product.name} Fiyatları ve Mağaza Karşılaştırma | ArduFiyat`;

  const description = priceText
    ? `${product.name} için ${product.offerCount} mağaza teklifini karşılaştır. En düşük fiyat ${priceText}. Güncel fiyat ve stok bilgilerini ArduFiyat'ta incele.`
    : `${product.name} fiyatlarını ve mağaza tekliflerini ArduFiyat'ta karşılaştır.`;

  const image = absoluteUrl(
    base,
    product.displayImageUrl ||
      product.imageUrl ||
      `/api/product-image/${encodeURIComponent(product.id)}`
  );

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description:
      product.description || description,
    sku: product.sku || undefined,
    brand: product.brand
      ? {
          '@type': 'Brand',
          name: product.brand
        }
      : undefined,
    category:
      product.category?.name || undefined,
    image: image ? [image] : undefined,
    url: canonical,
    offers: prices.length
      ? {
          '@type': 'AggregateOffer',
          priceCurrency: 'TRY',
          lowPrice,
          highPrice,
          offerCount: product.offerCount,
          url: canonical
        }
      : undefined
  };

  const safeSchema = JSON.stringify(schema)
    .replace(/</g, '\\u003c');

  let html = template;

  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(title)}</title>`
  );

  html = html.replace(
    /<meta\s+name=["']description["'][^>]*>/i,
    `<meta name="description" content="${escapeHtml(description)}" />`
  );

  const seoTags = `
  <link rel="canonical" href="${escapeHtml(canonical)}" />

  <meta name="robots" content="index,follow,max-image-preview:large" />

  <meta property="og:type" content="product" />
  <meta property="og:locale" content="tr_TR" />
  <meta property="og:site_name" content="ArduFiyat" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}

  <script type="application/ld+json">${safeSchema}</script>
`;

  return html.replace(
    '</head>',
    `${seoTags}\n</head>`
  );
}

export function renderSitemapXml({
  origin,
  products
}) {
  const base = cleanOrigin(origin);

  const urls = [
    `  <url>
    <loc>${escapeXml(`${base}/`)}</loc>
  </url>`
  ];

  for (const product of products) {
    if (!product.slug) continue;

    const location =
      `${base}/urun/${encodeURIComponent(product.slug)}`;

    const lastmod = validDate(
      product.updatedAt
    );

    urls.push(
      `  <url>
    <loc>${escapeXml(location)}</loc>${
      lastmod
        ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>`
        : ''
    }
  </url>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}
