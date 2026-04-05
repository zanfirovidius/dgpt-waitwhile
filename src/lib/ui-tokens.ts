export const RESOURCE_SWATCHES = [
  '#5878C8',
  '#C96B5A',
  '#B88F45',
  '#5C9477',
  '#4E8FA3',
  '#7A6CB0',
  '#B46887',
  '#5D938F',
  '#A77458',
  '#6F8299',
  '#C15F6A',
  '#7C9652',
  '#507FA8',
  '#9A8358',
  '#8D6C66',
  '#6C8EA5',
] as const;

export function getResourceSwatch(index: number) {
  return RESOURCE_SWATCHES[index % RESOURCE_SWATCHES.length];
}

export const QR_THEME = {
  canvasBackground: '#FFFFFF',
  pageBackground: '#F3F6F8',
  surface: '#FBFCFD',
  border: '#D8E0E6',
  title: '#15232E',
  text: '#556774',
  muted: '#7B8E99',
  shadow: '0 18px 42px rgba(23, 40, 58, 0.08)',
} as const;
