import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testWaitwhile() {
  try {
    const res = await axios.get('https://api.waitwhile.com/v2/locations', {
      headers: {
        'apikey': process.env.WAITWHILE_API_KEY
      }
    });
    console.log('Response structure:', Object.keys(res.data));
    console.log('Data sample:', Array.isArray(res.data) ? res.data.slice(0, 1) : res.data?.data?.slice(0, 1) || res.data);
  } catch (err: any) {
    console.error('Error fetching locations:', err.response?.data || err.message);
  }
}

testWaitwhile();
