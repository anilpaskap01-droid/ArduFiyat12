import fs from 'node:fs';
import path from 'node:path';
import { seedFile, dataFile } from '../src/store.js';
fs.mkdirSync(path.dirname(dataFile), { recursive: true });
fs.copyFileSync(seedFile, dataFile);
console.log('Veritabanı örnek veriye sıfırlandı.');
