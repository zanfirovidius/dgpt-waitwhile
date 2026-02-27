require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

async function test() {
  const API_KEY = process.env.WAITWHILE_API_KEY;

  let res = await fetch(`https://api.waitwhile.com/v2/locations`, {
      method: 'GET',
      headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' },
  });
  let locs = await res.json();
  
  if (locs.results.length > 0) {
    let target = locs.results[0].id;
    let res2 = await fetch(`https://api.waitwhile.com/v2/locations/${target}`, {
        method: 'GET',
        headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' },
    });
    let data = await res2.json();
    fs.writeFileSync('location_dump.json', JSON.stringify(data, null, 2));
    console.log("Dumped to location_dump.json");
  }
}
test();
