import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log('--- TEST START ---');
console.log('ENDPOINT:', process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT);
console.log('PROJECT:', process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID);

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);
databases.listCollections(process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!)
    .then(res => {
        console.log('SUCCESS: Found', res.total, 'collections');
        process.exit(0);
    })
    .catch(err => {
        console.error('FAILURE:', err.message);
        process.exit(1);
    });
