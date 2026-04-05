import { Query, Databases } from 'node-appwrite';

/**
 * Normalizes text to a URL-friendly slug.
 * - Lowercase
 * - Hyphen-separated
 * - Removes Romanian diacritics
 * - Removes non-alphanumeric characters (except hyphens)
 */
export function normalizeToSlug(text: string): string {
  const charMap: Record<string, string> = {
    'ă': 'a', 'â': 'a', 'î': 'i', 'ș': 's', 'ț': 't',
    'Ă': 'a', 'Â': 'a', 'Î': 'i', 'Ș': 's', 'Ț': 't',
    'ş': 's', 'ţ': 't', 'Ş': 's', 'Ţ': 't' // Older cedilla variants
  };

  const slug = text.split('').map(char => charMap[char] || char).join('');
  
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ensures a slug is unique across all projects.
 * If duplicate, appends -2, -3, etc.
 */
export async function ensureUniqueProjectSlug(
  databases: Databases,
  databaseId: string,
  collectionId: string,
  baseSlug: string,
  excludeProjectId?: string
): Promise<string> {
  let currentSlug = baseSlug;
  let counter = 1;
  let isUnique = false;

  while (!isUnique) {
    const queries = [Query.equal('projectSlug', currentSlug)];
    const res = await databases.listDocuments(databaseId, collectionId, queries);
    
    // Check if any results found (that aren't the current project we're editing)
    const otherProjects = res.documents.filter(doc => doc.$id !== excludeProjectId);
    
    if (otherProjects.length === 0) {
      isUnique = true;
    } else {
      counter++;
      currentSlug = `${baseSlug}-${counter}`;
    }
  }

  return currentSlug;
}
