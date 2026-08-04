import 'dotenv/config';
import { runPriceSync } from '../src/price-sync.js';
const result = await runPriceSync('cli');
console.log(result);
