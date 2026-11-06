// Fixed named palette for every power. Hues are spaced so neighbours on the map never share a colour family;
// the three warm "yellows" are separated by lightness (ochre dark, gold bright, sand pale).
export const OWNER_COLORS: Record<string, string> = {
  ottoman: '#c41e2a', // crimson
  byzantium: '#6a1b9a', // purple
  venice: '#00897b', // teal
  hungary: '#2e7d32', // green
  serbia: '#1e5bb8', // blue
  wallachia: '#f4f4f0', // white
  albania: '#1c1c1c', // black
  karaman: '#a8641e', // ochre
  mamluks: '#f2c010', // gold
  aqqoyunlu: '#d8c9a3', // sand
  papacy: '#f2c010',
};

/** Legend order and labels. */
export const LEGEND: { id: string; name: string; colour: string }[] = [
  { id: 'ottoman', name: 'Ottoman', colour: 'crimson' },
  { id: 'byzantium', name: 'Byzantium', colour: 'purple' },
  { id: 'venice', name: 'Venice', colour: 'teal' },
  { id: 'hungary', name: 'Hungary', colour: 'green' },
  { id: 'serbia', name: 'Serbia', colour: 'blue' },
  { id: 'wallachia', name: 'Wallachia', colour: 'white' },
  { id: 'albania', name: 'Albania', colour: 'black' },
  { id: 'karaman', name: 'Karaman', colour: 'ochre' },
  { id: 'mamluks', name: 'Mamluks', colour: 'gold' },
  { id: 'aqqoyunlu', name: 'Aq Qoyunlu', colour: 'sand' },
];
