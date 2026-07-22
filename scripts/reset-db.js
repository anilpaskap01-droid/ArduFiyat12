import fs from 'node:fs';
import { seedFile, dataFile } from '../src/store.js';
fs.copyFileSync(seedFile, dataFile);
console.log('Veritabanı örnek veriye sıfırlandı.');
