// On-air text in en, fr, es, pt. Every new on-air string gets all four.
// TODO(overlay): fill in as widgets are built.

const STRINGS = {
  en: { estimated: 'Estimated positions', lap: 'Lap', pit: 'Pit' },
  fr: { estimated: 'Positions estimées', lap: 'Tour', pit: 'Stand' },
  es: { estimated: 'Posiciones estimadas', lap: 'Vuelta', pit: 'Boxes' },
  pt: { estimated: 'Posições estimadas', lap: 'Volta', pit: 'Box' },
};

export function translator(lang) {
  const table = STRINGS[lang] || STRINGS.en;
  return (key) => table[key] ?? STRINGS.en[key] ?? key;
}
