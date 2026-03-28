import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);
const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;

async function auditProjects() {
  try {
    const res = await databases.getCollection(DATABASE_ID, PROJECTS_COLLECTION_ID);
    console.log('--- Current Attributes ---');
    res.attributes.forEach(a => console.log(`${a.key} (${a.type}) - ${a.status}`));
    console.log(`Total: ${res.attributes.length}`);
  } catch (err) {
    console.error('Audit failed:', err);
  }
}

auditProjects();
