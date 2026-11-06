import type { Neighbour, NeighbourId } from '../types';

type N = Omit<Neighbour, 'truceUntilTurn'> & { truceMonths?: number };

export function neighbours1451(): N[] {
  return [
    { id: 'hungary', name: 'Kingdom of Hungary', ruler: 'John Hunyadi, regent for Ladislaus V', stance: -45, relation: 'truce', truceMonths: 36, tributeToUs: 0, tributeFromUs: 0, fieldArmy: 30000, quality: 1.3, aggression: 6, navy: 10, recovery: 600, maxArmy: 40000, resilience: 6, capital: 'buda' },
    { id: 'venice', name: 'Republic of Venice', ruler: 'Doge Francesco Foscari', stance: 5, relation: 'peace', tributeToUs: 0, tributeFromUs: 0, fieldArmy: 8000, quality: 1.0, aggression: 3, navy: 60, recovery: 200, maxArmy: 12000, resilience: 4, capital: null },
    { id: 'papacy', name: 'The Papacy', ruler: 'Pope Nicholas V', stance: -70, relation: 'none', tributeToUs: 0, tributeFromUs: 0, fieldArmy: 0, quality: 1.0, aggression: 4, navy: 10, recovery: 0, maxArmy: 0, resilience: 3, capital: null },
    { id: 'serbia', name: 'Serbian Despotate', ruler: 'Despot Đurađ Branković', stance: 20, relation: 'tributary', tributeToUs: 1_200_000, tributeFromUs: 0, fieldArmy: 10000, quality: 1.0, aggression: 2, navy: 0, recovery: 250, maxArmy: 14000, resilience: 3, capital: 'smederevo' },
    { id: 'wallachia', name: 'Principality of Wallachia', ruler: 'Voivode Vladislav II', stance: 10, relation: 'tributary', tributeToUs: 450_000, tributeFromUs: 0, fieldArmy: 10000, quality: 0.9, aggression: 4, navy: 0, recovery: 300, maxArmy: 14000, resilience: 7, capital: 'wallachia' },
    { id: 'byzantium', name: 'Byzantine Empire', ruler: 'Constantine XI Palaiologos', stance: -10, relation: 'peace', tributeToUs: 0, tributeFromUs: 300_000, fieldArmy: 7000, quality: 1.0, aggression: 2, navy: 26, recovery: 80, maxArmy: 9000, resilience: 9, capital: 'constantinople' },
    { id: 'karaman', name: 'Beylik of Karaman', ruler: 'İbrahim II Bey', stance: -40, relation: 'peace', tributeToUs: 0, tributeFromUs: 0, fieldArmy: 20000, quality: 0.9, aggression: 6, navy: 0, recovery: 500, maxArmy: 25000, resilience: 6, capital: 'konya' },
    { id: 'mamluks', name: 'Mamluk Sultanate', ruler: 'Sultan al-Zahir Jaqmaq', stance: 20, relation: 'peace', tributeToUs: 0, tributeFromUs: 0, fieldArmy: 25000, quality: 1.4, aggression: 2, navy: 20, recovery: 500, maxArmy: 40000, resilience: 6, capital: null },
    { id: 'aqqoyunlu', name: 'Aq Qoyunlu Confederation', ruler: 'Jahangir Bey', stance: 0, relation: 'none', tributeToUs: 0, tributeFromUs: 0, fieldArmy: 25000, quality: 1.2, aggression: 4, navy: 0, recovery: 500, maxArmy: 35000, resilience: 7, capital: 'diyarbakir' },
    { id: 'albania', name: 'League of Lezhë (Albania)', ruler: 'Gjergj Kastrioti Skanderbeg', stance: -80, relation: 'war', tributeToUs: 0, tributeFromUs: 0, fieldArmy: 10000, quality: 1.2, aggression: 5, navy: 0, recovery: 250, maxArmy: 15000, resilience: 9, capital: 'kruje' },
  ];
}

export function neighbours1421(): N[] {
  const base = neighbours1451();
  const set = (id: NeighbourId, patch: Partial<N>) => Object.assign(base.find((n) => n.id === id)!, patch);
  set('hungary', { ruler: 'King Sigismund of Luxembourg', stance: -35, relation: 'peace', truceMonths: 0, fieldArmy: 28000 });
  set('venice', { ruler: 'Doge Tommaso Mocenigo', stance: 0 });
  set('papacy', { ruler: 'Pope Martin V', stance: -50 });
  set('serbia', { ruler: 'Despot Stefan Lazarević', stance: 30, relation: 'vassal', tributeToUs: 1_000_000, fieldArmy: 12000 });
  set('wallachia', { ruler: 'Voivode Dan II', stance: -15, relation: 'tributary', tributeToUs: 300_000 });
  set('byzantium', { ruler: 'Manuel II Palaiologos (with John VIII)', stance: -35, relation: 'peace', tributeFromUs: 0, fieldArmy: 9000, maxArmy: 11000 });
  set('karaman', { ruler: 'Mehmed II Bey of Karaman', stance: -45 });
  set('mamluks', { ruler: 'Sultan al-Zahir Tatar', stance: 15 });
  set('aqqoyunlu', { ruler: 'Qara Yuluk Osman Bey', stance: 0, fieldArmy: 18000 });
  set('albania', { ruler: 'Gjon Kastrioti and the Albanian lords', stance: 0, relation: 'tributary', tributeToUs: 100_000, fieldArmy: 4000, aggression: 1 });
  return base;
}
