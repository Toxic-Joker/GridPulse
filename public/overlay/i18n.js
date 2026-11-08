// On-air text in en, fr, es, pt. Every new on-air string gets all four.

const STRINGS = {
  en: {
    race: 'Race', sprint: 'Sprint', qualifying: 'Qualifying', sprint_qualifying: 'Sprint Qualifying', practice: 'Practice',
    lap: 'Lap', interval: 'Interval', gap: 'Gap', pit: 'Pit', out: 'Out', retired: 'Out', page: 'Page',
    waiting: 'Waiting for the session', estimated: 'Estimated positions', camera: 'Camera',
    lightsOut: 'Lights out', restart: 'Restart', overtake: 'Overtake', newLeader: 'New leader', pitStop: 'Pit stop', stop: 'Stop',
    fastestLap: 'Fastest lap', penalty: 'Penalty', retirement: 'Retired', lap1: 'Lap 1', chequered: 'Chequered flag', wins: 'wins',
    for: 'for', on: 'on', safetyCar: 'Safety car', vsc: 'Virtual safety car', vscEnding: 'VSC ending', redFlag: 'Red flag', yellow: 'Yellow flag', trackClear: 'Track clear',
    gains: 'Gains', losses: 'Losses', laps: 'laps',
  },
  fr: {
    race: 'Course', sprint: 'Sprint', qualifying: 'Qualifications', sprint_qualifying: 'Qualifications sprint', practice: 'Essais',
    lap: 'Tour', interval: 'Intervalle', gap: 'Écart', pit: 'Stand', out: 'Sortie', retired: 'Abandon', page: 'Page',
    waiting: 'En attente de la séance', estimated: 'Positions estimées', camera: 'Caméra',
    lightsOut: 'Départ', restart: 'Relance', overtake: 'Dépassement', newLeader: 'Nouveau leader', pitStop: 'Arrêt au stand', stop: 'Arrêt',
    fastestLap: 'Meilleur tour', penalty: 'Pénalité', retirement: 'Abandon', lap1: 'Tour 1', chequered: 'Drapeau à damier', wins: 'gagne',
    for: 'pour', on: 'sur', safetyCar: 'Voiture de sécurité', vsc: 'Voiture de sécurité virtuelle', vscEnding: 'Fin de VSC', redFlag: 'Drapeau rouge', yellow: 'Drapeau jaune', trackClear: 'Piste dégagée',
    gains: 'Gagnés', losses: 'Perdus', laps: 'tours',
  },
  es: {
    race: 'Carrera', sprint: 'Sprint', qualifying: 'Clasificación', sprint_qualifying: 'Clasificación sprint', practice: 'Libres',
    lap: 'Vuelta', interval: 'Intervalo', gap: 'Diferencia', pit: 'Boxes', out: 'Salida', retired: 'Fuera', page: 'Página',
    waiting: 'Esperando la sesión', estimated: 'Posiciones estimadas', camera: 'Cámara',
    lightsOut: 'Apagan semáforos', restart: 'Reanudación', overtake: 'Adelantamiento', newLeader: 'Nuevo líder', pitStop: 'Parada en boxes', stop: 'Parada',
    fastestLap: 'Vuelta rápida', penalty: 'Sanción', retirement: 'Abandono', lap1: 'Vuelta 1', chequered: 'Bandera a cuadros', wins: 'gana',
    for: 'por', on: 'a', safetyCar: 'Coche de seguridad', vsc: 'Coche de seguridad virtual', vscEnding: 'Fin del VSC', redFlag: 'Bandera roja', yellow: 'Bandera amarilla', trackClear: 'Pista despejada',
    gains: 'Ganan', losses: 'Pierden', laps: 'vueltas',
  },
  pt: {
    race: 'Corrida', sprint: 'Sprint', qualifying: 'Classificação', sprint_qualifying: 'Classificação sprint', practice: 'Treino livre',
    lap: 'Volta', interval: 'Intervalo', gap: 'Diferença', pit: 'Box', out: 'Saída', retired: 'Fora', page: 'Página',
    waiting: 'Aguardando a sessão', estimated: 'Posições estimadas', camera: 'Câmera',
    lightsOut: 'Largada', restart: 'Relargada', overtake: 'Ultrapassagem', newLeader: 'Novo líder', pitStop: 'Pit stop', stop: 'Parada',
    fastestLap: 'Volta mais rápida', penalty: 'Punição', retirement: 'Abandono', lap1: 'Volta 1', chequered: 'Bandeira quadriculada', wins: 'vence',
    for: 'pelo', on: 'sobre', safetyCar: 'Safety car', vsc: 'Safety car virtual', vscEnding: 'Fim do VSC', redFlag: 'Bandeira vermelha', yellow: 'Bandeira amarela', trackClear: 'Pista liberada',
    gains: 'Ganhos', losses: 'Perdas', laps: 'voltas',
  },
};

export function translator(lang) {
  const table = STRINGS[lang] || STRINGS.en;
  return (key) => table[key] ?? STRINGS.en[key] ?? key;
}
