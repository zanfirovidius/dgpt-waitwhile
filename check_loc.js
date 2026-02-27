import { getLocations, getLocationDetails } from './src/app/actions/waitwhile.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
  const locs = await getLocations();
  if (locs.success && locs.data.length > 0) {
    const target = locs.data[0].id;
    console.log("Using loc", target);
    const res = await getLocationDetails(target);
    if (res.success) {
      console.log(JSON.stringify(res.data.businessHours, null, 2));
    }
  }
}
test();
