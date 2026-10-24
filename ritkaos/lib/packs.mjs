// Ritkaos+ word packs. Server-only, like prompts.mjs: the browser never downloads answers.
import nineties from './packs/nineties.mjs';
import office from './packs/office.mjs';
import holidays from './packs/holidays.mjs';
import food from './packs/food.mjs';
import internet from './packs/internet.mjs';
const SOURCES = { nineties, office, holidays, food, internet };
const NAMES = { nineties: ['90-talet', 'The 90s'], office: ['Kontoret', 'The Office'], holidays: ['Jul', 'Holidays'], food: ['Svensk mat', 'Food'], internet: ['Internet', 'Internet'] };
const list = s => s.split(',').map(x => x.trim()).filter(Boolean);
const build = (lang, pack) => SOURCES[pack][lang].map(([answer, scene, aliases, safe], i) => ({
  id: `${lang === 'en' ? 'en-' : ''}${pack}${i}`, answer, scene, aliases: list(aliases), category: NAMES[pack][lang === 'en' ? 1 : 0], pack, safe: safe !== false,
}));
export const PACKS = Object.fromEntries(['sv', 'en'].map(lang => [lang, Object.fromEntries(Object.keys(SOURCES).map(pack => [pack, build(lang, pack)]))]));
