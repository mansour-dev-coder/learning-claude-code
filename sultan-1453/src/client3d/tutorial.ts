// Mission 1 tutorial: the Grand Vizier walks the young Sultan through the Divan, the map and the palace.
// Each step either waits for something the player does (an event name) or for "Next".

export type TutorialEvent =
  | 'answered:accessionDonative'
  | 'answered:fratricideQuestion'
  | 'provincePanel'
  | 'palace:on'
  | 'palace:off'
  | 'talk:min:grandVizier'
  | 'endMonth'
  | 'karamanRose'
  | 'order:war';

export interface TutorialStep {
  text: string;
  /** CSS selector to highlight */
  target?: string;
  /** advances when this happens; otherwise a Next button */
  until?: TutorialEvent;
  /** only show once this has happened (the step waits silently until then) */
  after?: TutorialEvent;
}

export const TUTORIAL: TutorialStep[] = [
  { text: 'Peace be upon you, my Sultan. I am Çandarlı Halil, your father’s Grand Vizier, and now yours. Allow an old servant to show you how the empire is governed.' },
  { text: 'Each month your Divan brings you its matters. First, the corps expects its accession gift: open the Divan panel and choose. Generosity costs akçe; meanness costs loyalty.', target: '#s3-divan', until: 'answered:accessionDonative' },
  { text: 'Next, the question of your infant brother, Küçük Ahmed. Whatever you decide, decide it: an unanswered matter takes its default course when the month ends.', target: '#s3-divan', until: 'answered:fratricideQuestion' },
  { text: 'Above is the Defterdar’s ledger: treasury, the monthly balance, arrears owed to the troops, bread for the capital, and the mood of the seven factions. These are his figures. Not every minister reports honestly.', target: '.hud' },
  { text: 'This is your realm, in crimson. Drag to turn the map, scroll to zoom. Click a province to see what you can order there: try Konya, the ochre lands of Karaman in the south-east.', until: 'provincePanel' },
  { text: 'Matters can also be heard in person. Enter the palace and find me in the Divan hall; the gold banners mark ministers with business for you.', target: '#s3-mode', until: 'talk:min:grandVizier' },
  { text: 'Just so. Return to the map when you are ready.', target: '#s3-mode', until: 'palace:off' },
  { text: 'When your orders are given, end the month. The engine of fate turns, the chronicler writes, and the Divan reconvenes.', target: '#s3-end', until: 'endMonth' },
  { text: 'Months pass quickly. Watch the mission panel: it shows what you must achieve and how many months remain. My spies say Karaman is stirring.', target: '#s3-obj', until: 'karamanRose' },
  { text: 'Karaman has risen, as I feared. Click Konya to march on it, or offer terms. A swift peace pleases the merchants; a victory pleases the Janissaries. You may write your orders in your own words, too.', after: 'karamanRose', until: 'order:war' },
  { text: 'You have the measure of it, my Sultan. I will trouble you no further unless the Divan requires it.' },
];
