import { getLocationDetails } from './src/app/actions/waitwhile.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
  const res = await getLocationDetails('gy3KaOCjN4YqYyvqd0Io');
  if (res.success) {
     const data = res.data;
     console.log("Location specialTime:", typeof data.specialTime === 'string' ? "String" : JSON.stringify(data.specialTime, null, 2));
     console.log("Location businessHours:", data.businessHours ? "Exists" : "No");
     console.log("Location keys:", Object.keys(data).filter(k => k.toLowerCase().includes('date') || k.toLowerCase().includes('time') || k.toLowerCase().includes('open') || k.toLowerCase().includes('sched')));
  } else {
     console.error("Error", res.error);
  }
}
test();
