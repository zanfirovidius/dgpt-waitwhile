require('dotenv').config({ path: '.env.local' });

async function test() {
  const API_KEY = process.env.WAITWHILE_API_KEY;

  let res = await fetch(`https://api.waitwhile.com/v2/locations`, {
      method: 'GET',
      headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' },
  });
  let locs = await res.json();
  
  if (locs.results && locs.results.length > 0) {
    let target = locs.results[0].id;
    
    let res2 = await fetch(`https://api.waitwhile.com/v2/resources?locationId=${target}&limit=100`, {
        method: 'GET',
        headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' },
    });
    let data = await res2.json();
    
    if (data.results) {
        data.results.forEach(r => {
            console.log(`[${r.id}] Name: "${r.name}" | isCategory: ${r.isCategory} | type: ${r.type} | scheduleType: ${r.scheduleType}`);
        });
    }
  }
}
test();
