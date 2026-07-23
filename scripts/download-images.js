import { syncAllProductImages } from '../src/image-sync.js';

const force = process.argv.includes('--force');
console.log(`Ürün fotoğrafları indiriliyor${force ? ' (zorla yenileme)' : ''}...`);

try {
  const result = await syncAllProductImages({ force, reason: 'cli' });
  console.log(`Tamamlandı: ${result.downloaded} indirildi, ${result.skipped} zaten vardı, ${result.failed} başarısız.`);

  if (result.failed) {
    for (const item of result.results.filter((entry) => entry.status === 'failed')) {
      console.log(`- ${item.productId}: ${item.error}`);
    }
  }
} catch (error) {
  console.error('Fotoğraf indirme işlemi başarısız:', error.message);
  process.exitCode = 1;
}
