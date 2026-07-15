export const STUDIO = {
  name: 'pk-Fussballschule Büro',
  address: 'Mainzer Landstrasse 52, 65795 Hattersheim am Main',
  phone: '+49 ... (folgt)',
  email: 'Info@pk-fussballschule.de',
  hours: 'Mo–Fr 9–18 Uhr',
};

export const LOCATIONS = ['Rüsselsheim', 'Kelsterbach', 'Groß-Gerau'] as const;
export type Location = typeof LOCATIONS[number];
