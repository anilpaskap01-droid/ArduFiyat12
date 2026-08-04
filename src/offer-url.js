const searchQueryKeys = new Set([
  'q',
  'k',
  'keyword',
  'keywords',
  'query',
  'querytext',
  'query_text',
  'search',
  'searchterm',
  'search_term',
  'searchtext',
  'search_text',
  'term',
  'text'
]);

const searchPathPattern = /(^|\/)(arama|ara|search|search-results?|searchresults?|catalogsearch)(\/|$)/i;
const listingPathPattern = /(^|\/)(categories|category|collections|collection|etiket|etiketler|meta-etiket|tags|tag)(\/|$)/i;
const homepagePaths = new Set(['/', '/tr', '/tr/', '/index.html']);

const knownProductPathPatterns = new Map([
  ['amazon.com.tr', [/(^|\/)dp\/[A-Z0-9]{10}(\/|$)/i, /(^|\/)gp\/product\/[A-Z0-9]{10}(\/|$)/i]],
  ['hepsiburada.com', [/-p[m]?-[A-Z0-9]+/i]],
  ['trendyol.com', [/-p-\d+/i]],
  ['vatanbilgisayar.com', [/\.html\/?$/i]],
  ['teknosa.com', [/-p-\d+/i]],
  ['mediamarkt.com.tr', [/(^|\/)tr\/product\//i, /(^|\/)product\//i]],
  ['n11.com', [/(^|\/)urun\//i]],
  ['pazarama.com', [/-p-\d+/i]]
]);

const knownListingPaths = new Map([
  ['direnc.net', new Set(['/esp-board'])],
  ['kirpilab.com', new Set(['/gelistirme-kartlari'])],
  ['robo90.com', new Set(['/arduino-modelleri'])]
]);

function issue(code, message) {
  return { code, message };
}

function parsedHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function decodedPathname(parsed) {
  try {
    return decodeURIComponent(parsed.pathname).toLowerCase();
  } catch {
    return parsed.pathname.toLowerCase();
  }
}

function valuesForHost(map, hostname) {
  const host = normalizeStoreDomain(hostname);
  for (const [domain, value] of map) {
    if (host === domain || host.endsWith(`.${domain}`)) return value;
  }
  return null;
}

export function normalizeStoreDomain(value = '') {
  const input = String(value || '').trim();
  if (!input) return '';

  try {
    const parsed = new URL(input.includes('://') ? input : `https://${input}`);
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function hostnameMatchesStore(hostname = '', storeDomain = '') {
  const actual = normalizeStoreDomain(hostname);
  const expected = normalizeStoreDomain(storeDomain);
  return Boolean(
    actual &&
    expected &&
    (actual === expected || actual.endsWith(`.${expected}`))
  );
}

export function isSearchUrl(value = '') {
  const parsed = parsedHttpUrl(value);
  if (!parsed) return false;

  const path = decodedPathname(parsed);
  const hasSearchQuery = [...parsed.searchParams.keys()]
    .some((key) => searchQueryKeys.has(key.toLowerCase()));

  return hasSearchQuery || searchPathPattern.test(path);
}

export function isHomepageUrl(value = '') {
  const parsed = parsedHttpUrl(value);
  if (!parsed) return false;
  return homepagePaths.has(parsed.pathname.toLowerCase());
}

export function isKnownNonProductUrl(value = '') {
  const parsed = parsedHttpUrl(value);
  if (!parsed) return false;

  const path = decodedPathname(parsed).replace(/\/$/, '') || '/';
  if (listingPathPattern.test(path)) return true;
  return valuesForHost(knownListingPaths, parsed.hostname)?.has(path) || false;
}

export function hasKnownProductPath(value = '') {
  const parsed = parsedHttpUrl(value);
  if (!parsed) return false;

  const patterns = valuesForHost(knownProductPathPatterns, parsed.hostname);
  if (!patterns) return true;
  return patterns.some((pattern) => pattern.test(parsed.pathname));
}

export function validateOfferUrl({ url, storeDomain } = {}) {
  const rawUrl = String(url || '').trim();
  const issues = [];

  if (!rawUrl) {
    issues.push(issue('EMPTY_URL', 'Teklif bağlantısı boş.'));
    return { valid: false, issues, url: null };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    issues.push(issue('INVALID_URL', 'Teklif bağlantısı geçerli bir URL değil.'));
    return { valid: false, issues, url: null };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    issues.push(issue('INVALID_PROTOCOL', 'Teklif bağlantısı HTTP veya HTTPS kullanmalı.'));
  }

  if (isSearchUrl(rawUrl)) {
    issues.push(issue('SEARCH_URL', 'Arama sayfası bağlantıları teklif olarak kullanılamaz.'));
  }

  if (isHomepageUrl(rawUrl)) {
    issues.push(issue('HOMEPAGE_URL', 'Mağaza ana sayfası teklif olarak kullanılamaz.'));
  }

  if (isKnownNonProductUrl(rawUrl) || !hasKnownProductPath(rawUrl)) {
    issues.push(issue('NON_PRODUCT_URL', 'Bağlantı doğrudan bir ürün detay sayfası değil.'));
  }

  const expectedDomain = normalizeStoreDomain(storeDomain);
  if (!expectedDomain) {
    issues.push(issue('STORE_DOMAIN_MISSING', 'Mağazanın geçerli bir alan adı yok.'));
  } else if (!hostnameMatchesStore(parsed.hostname, expectedDomain)) {
    issues.push(issue('DOMAIN_MISMATCH', `Bağlantı alan adı mağazanın ${expectedDomain} alan adıyla eşleşmiyor.`));
  }

  return {
    valid: issues.length === 0,
    issues,
    url: parsed
  };
}

export function isDirectOfferUrl(url, storeDomain) {
  return validateOfferUrl({ url, storeDomain }).valid;
}

export function firstOfferUrlIssue(url, storeDomain) {
  return validateOfferUrl({ url, storeDomain }).issues[0] || null;
}
