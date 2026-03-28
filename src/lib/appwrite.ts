import { Client, Account, Teams, Databases } from 'appwrite';

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '';

export const client = new Client();

if (endpoint && projectId) {
    client
        .setEndpoint(endpoint)
        .setProject(projectId);
} else {
    console.warn("Appwrite environment variables are missing!");
}

export const account = new Account(client);
export const teams = new Teams(client);
export const databases = new Databases(client);
export { ID } from 'appwrite';
