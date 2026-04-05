/**
 * Normalizes a name for robust comparison:
 * - Removes Romanian diacritics (ș -> s, ț -> t, etc.)
 * - Lowercase
 * - Trims extra spaces
 * - Keeps only alphanumeric characters and spaces
 */
export function normalizeName(name: string): string {
    const charMap: Record<string, string> = {
        'ă': 'a', 'â': 'a', 'î': 'i', 'ș': 's', 'ț': 't',
        'Ă': 'A', 'Â': 'A', 'Î': 'I', 'Ș': 'S', 'Ț': 'T',
        'ş': 's', 'ţ': 't', 'Ş': 'S', 'Ţ': 'T' // Older cedilla variants
    };

    const normalized = name.split('').map(char => charMap[char] || char).join('');
    
    return normalized
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '') // Keep spaces
        .replace(/\s+/g, ' ');
}
