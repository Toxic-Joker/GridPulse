// On-air text in en, fr, es, pt. Every new on-air string gets all four.

const STRINGS = {
  en: {
    race: 'Race', sprint: 'Sprint', qualifying: 'Qualifying', sprint_qualifying: 'Sprint Qualifying', practice: 'Practice',
    lap: 'Lap', interval: 'Interval', gap: 'Gap', pit: 'Pit', out: 'Out', retired: 'Out', page: 'Page',
    waiting: 'Waiting for the session', estimated: 'Estimated positions', camera: 'Camera',
    lightsOut: 'Lights out', restart: 'Restart', overtake: 'Overtake', newLeader: 'New leader', pitStop: 'Pit stop', stop: 'Stop',
    fastestLap: 'Fastest lap', penalty: 'Penalty', retirement: 'Retired', lap1: 'Lap 1', chequered: 'Chequered flag', wins: 'wins',
    for: 'for', on: 'on', safetyCar: 'Safety car', vsc: 'Virtual safety car', vscEnding: 'VSC ending', redFlag: 'Red flag', yellow: 'Yellow flag', trackClear: 'Track clear',
    gains: 'Gains', losses: 'Losses', laps: 'laps', waitingMap: 'Loading the circuit map',
    championship: 'Championship', drivers: 'Drivers', constructors: 'Constructors', projected: 'Projected championship', projectedNote: 'Shown during a race or sprint', afterRound: 'after round', loading: 'Loading', nextSession: 'Next session', noSession: 'No session scheduled', daysShort: 'd', result: 'Result', runningOrder: 'Running order',
    follow: 'Follow', presentedBy: 'Presented by', weather: 'Weather', trackTemp: 'Track', airTemp: 'Air', humidity: 'Humidity', wind: 'Wind', rain: 'Rain', dry: 'Dry', grid: 'Grid', tyreStrategy: 'Tyre strategy',
    timesheet: 'Timesheet', cutAfter: 'Cut after', finalPart: 'Shoot-out for pole', provisionalPole: 'Provisional pole', fastestTime: 'Fastest time', knockedOut: 'Knocked out', safe: 'Out of the drop zone', dropsIn: 'drops in', lapDeleted: 'Lap deleted', dropZone: 'Drop zone', dropZoneNote: 'Shown in qualifying', timeToBeat: 'To beat', noTime: 'No time', outLap: 'Out lap',
  },
  fr: {
    race: 'Course', sprint: 'Sprint', qualifying: 'Qualifications', sprint_qualifying: 'Qualifications sprint', practice: 'Essais',
    lap: 'Tour', interval: 'Intervalle', gap: 'Écart', pit: 'Stand', out: 'Sortie', retired: 'Abandon', page: 'Page',
    waiting: 'En attente de la séance', estimated: 'Positions estimées', camera: 'Caméra',
    lightsOut: 'Départ', restart: 'Relance', overtake: 'Dépassement', newLeader: 'Nouveau leader', pitStop: 'Arrêt au stand', stop: 'Arrêt',
    fastestLap: 'Meilleur tour', penalty: 'Pénalité', retirement: 'Abandon', lap1: 'Tour 1', chequered: 'Drapeau à damier', wins: 'gagne',
    for: 'pour', on: 'sur', safetyCar: 'Voiture de sécurité', vsc: 'Voiture de sécurité virtuelle', vscEnding: 'Fin de VSC', redFlag: 'Drapeau rouge', yellow: 'Drapeau jaune', trackClear: 'Piste dégagée',
    gains: 'Gagnés', losses: 'Perdus', laps: 'tours', waitingMap: 'Chargement du circuit',
    championship: 'Championnat', drivers: 'Pilotes', constructors: 'Constructeurs', projected: 'Championnat en direct', projectedNote: 'Affiché pendant une course ou un sprint', afterRound: 'après la manche', loading: 'Chargement', nextSession: 'Prochaine séance', noSession: 'Aucune séance prévue', daysShort: 'j', result: 'Résultat', runningOrder: 'Classement provisoire',
    follow: 'Suivez', presentedBy: 'Présenté par', weather: 'Météo', trackTemp: 'Piste', airTemp: 'Air', humidity: 'Humidité', wind: 'Vent', rain: 'Pluie', dry: 'Sec', grid: 'Grille', tyreStrategy: 'Stratégie pneus',
    timesheet: 'Classement', cutAfter: 'Éliminés après', finalPart: 'Duel pour la pole', provisionalPole: 'Pole provisoire', fastestTime: 'Meilleur temps', knockedOut: 'Éliminés', safe: 'Hors de la zone rouge', dropsIn: 'y tombe', lapDeleted: 'Tour annulé', dropZone: 'Zone rouge', dropZoneNote: 'Affiché en qualifications', timeToBeat: 'À battre', noTime: 'Sans temps', outLap: 'Tour de sortie',
  },
  es: {
    race: 'Carrera', sprint: 'Sprint', qualifying: 'Clasificación', sprint_qualifying: 'Clasificación sprint', practice: 'Libres',
    lap: 'Vuelta', interval: 'Intervalo', gap: 'Diferencia', pit: 'Boxes', out: 'Salida', retired: 'Fuera', page: 'Página',
    waiting: 'Esperando la sesión', estimated: 'Posiciones estimadas', camera: 'Cámara',
    lightsOut: 'Apagan semáforos', restart: 'Reanudación', overtake: 'Adelantamiento', newLeader: 'Nuevo líder', pitStop: 'Parada en boxes', stop: 'Parada',
    fastestLap: 'Vuelta rápida', penalty: 'Sanción', retirement: 'Abandono', lap1: 'Vuelta 1', chequered: 'Bandera a cuadros', wins: 'gana',
    for: 'por', on: 'a', safetyCar: 'Coche de seguridad', vsc: 'Coche de seguridad virtual', vscEnding: 'Fin del VSC', redFlag: 'Bandera roja', yellow: 'Bandera amarilla', trackClear: 'Pista despejada',
    gains: 'Ganan', losses: 'Pierden', laps: 'vueltas', waitingMap: 'Cargando el circuito',
    championship: 'Campeonato', drivers: 'Pilotos', constructors: 'Constructores', projected: 'Campeonato en vivo', projectedNote: 'Se muestra durante una carrera o sprint', afterRound: 'tras la ronda', loading: 'Cargando', nextSession: 'Próxima sesión', noSession: 'No hay sesión prevista', daysShort: 'd', result: 'Resultado', runningOrder: 'Orden provisional',
    follow: 'Sígueme', presentedBy: 'Presentado por', weather: 'Clima', trackTemp: 'Pista', airTemp: 'Aire', humidity: 'Humedad', wind: 'Viento', rain: 'Lluvia', dry: 'Seco', grid: 'Parrilla', tyreStrategy: 'Estrategia de neumáticos',
    timesheet: 'Tiempos', cutAfter: 'Corte tras', finalPart: 'Lucha por la pole', provisionalPole: 'Pole provisional', fastestTime: 'Mejor tiempo', knockedOut: 'Eliminados', safe: 'Fuera de la zona de eliminación', dropsIn: 'cae', lapDeleted: 'Vuelta anulada', dropZone: 'Zona de eliminación', dropZoneNote: 'Se muestra en clasificación', timeToBeat: 'A batir', noTime: 'Sin tiempo', outLap: 'Vuelta de salida',
  },
  pt: {
    race: 'Corrida', sprint: 'Sprint', qualifying: 'Classificação', sprint_qualifying: 'Classificação sprint', practice: 'Treino livre',
    lap: 'Volta', interval: 'Intervalo', gap: 'Diferença', pit: 'Box', out: 'Saída', retired: 'Fora', page: 'Página',
    waiting: 'Aguardando a sessão', estimated: 'Posições estimadas', camera: 'Câmera',
    lightsOut: 'Largada', restart: 'Relargada', overtake: 'Ultrapassagem', newLeader: 'Novo líder', pitStop: 'Pit stop', stop: 'Parada',
    fastestLap: 'Volta mais rápida', penalty: 'Punição', retirement: 'Abandono', lap1: 'Volta 1', chequered: 'Bandeira quadriculada', wins: 'vence',
    for: 'pelo', on: 'sobre', safetyCar: 'Safety car', vsc: 'Safety car virtual', vscEnding: 'Fim do VSC', redFlag: 'Bandeira vermelha', yellow: 'Bandeira amarela', trackClear: 'Pista liberada',
    gains: 'Ganhos', losses: 'Perdas', laps: 'voltas', waitingMap: 'Carregando o circuito',
    championship: 'Campeonato', drivers: 'Pilotos', constructors: 'Construtores', projected: 'Campeonato ao vivo', projectedNote: 'Exibido durante uma corrida ou sprint', afterRound: 'após a etapa', loading: 'Carregando', nextSession: 'Próxima sessão', noSession: 'Nenhuma sessão prevista', daysShort: 'd', result: 'Resultado', runningOrder: 'Ordem provisória',
    follow: 'Siga', presentedBy: 'Apresentado por', weather: 'Tempo', trackTemp: 'Pista', airTemp: 'Ar', humidity: 'Umidade', wind: 'Vento', rain: 'Chuva', dry: 'Seco', grid: 'Grid', tyreStrategy: 'Estratégia de pneus',
    timesheet: 'Tempos', cutAfter: 'Corte após', finalPart: 'Disputa pela pole', provisionalPole: 'Pole provisória', fastestTime: 'Melhor tempo', knockedOut: 'Eliminados', safe: 'Fora da zona de eliminação', dropsIn: 'cai', lapDeleted: 'Volta anulada', dropZone: 'Zona de eliminação', dropZoneNote: 'Exibido na classificação', timeToBeat: 'A bater', noTime: 'Sem tempo', outLap: 'Volta de saída',
  },
};

export function translator(lang) {
  const table = STRINGS[lang] || STRINGS.en;
  return (key) => table[key] ?? STRINGS.en[key] ?? key;
}
