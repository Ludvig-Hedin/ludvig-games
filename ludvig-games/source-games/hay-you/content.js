export const MOODS = [
  { id: 'wild', name: 'A little wild', icon: 'bolt', description: 'Fast gallops. Questionable decisions.' },
  { id: 'soft', name: 'Soft & stable', icon: 'flower', description: 'Slow sunsets. Excellent snacks.' },
  { id: 'fancy', name: 'High standards', icon: 'sparkles', description: 'Good manners. Better oats.' },
];

export const HORSES = [
  {
    id: 'sir-neighs', name: 'Sir Neighs-a-Lot', age: 7, breed: 'Thoroughbred', distance: '2 km away',
    bio: 'Emotionally available. Physically in the wrong paddock. Looking for someone to jump fences with.',
    tags: ['Bad influence', 'Sunset gallops', 'Fence enthusiast'], vibe: 'wild', color: '#b96439', mane: '#35251e', portrait: 0,
    kicker: 'Trouble, but handsome.', opening: 'The gate is open. What do we do?',
    choices: [
      { text: 'Respect the property boundaries.', response: 'Of course. Boundaries. My famous weakness.', chemistry: 8 },
      { text: 'Race you to absolutely nowhere.', response: 'Finally. Someone with a five-year plan.', chemistry: 35 },
      { text: 'Take a picnic. Escape responsibly.', response: 'Reckless AND snack-conscious. I respect it.', chemistry: 20 },
    ],
    successLine: 'You jumped the fence. And into his heart.', failLine: 'He escaped the paddock. And the conversation.',
  },
  {
    id: 'hayley', name: 'Hayley', age: 6, breed: 'Andalusian', distance: '1 km away',
    bio: 'My love language is sharing the good patch of grass. Please bring flowers. Not to look at. To eat.',
    tags: ['Flower girl', 'Slow mornings', 'Snack romantic'], vibe: 'soft', color: '#eee8db', mane: '#e3d2ae', portrait: 1,
    kicker: 'A meadow kind of love.', opening: 'You brought me a bouquet. What happens next?',
    choices: [
      { text: 'We eat it together. Obviously.', response: 'Finally, someone who understands fine dining.', chemistry: 35 },
      { text: 'I take 43 photos of it first.', response: 'The daisies are getting cold.', chemistry: 8 },
      { text: 'I save the biggest daisy for you.', response: 'That is aggressively thoughtful.', chemistry: 20 },
    ],
    successLine: 'She saved you the best patch of grass.', failLine: 'Lovely date. Zero butterflies. Several actual flies.',
  },
  {
    id: 'neighonce', name: 'Neighoncé', age: 8, breed: 'Friesian', distance: '4 km away',
    bio: 'Main character mane. I do not chase. I make a tasteful entrance and let things happen.',
    tags: ['Mane character', 'VIP pasture', 'No autographs'], vibe: 'fancy', color: '#34312f', mane: '#191b21', portrait: 2,
    kicker: 'Out of your league. Probably.', opening: 'What would you say is my best feature?',
    choices: [
      { text: 'Your surprisingly reasonable hay budget.', response: 'My accountant agrees. My heart does not.', chemistry: 8 },
      { text: 'The sunglasses are doing a lot.', response: 'They are custom. Thank you for noticing.', chemistry: 20 },
      { text: 'Your entrance. The meadow went quiet.', response: 'You were watching. Excellent.', chemistry: 35 },
    ],
    successLine: 'You made the VIP pasture. Bring your best mane.', failLine: 'Her assistant will be in touch. Her assistant is a goat.',
  },
  {
    id: 'buck', name: 'Buck Wild', age: 9, breed: 'Quarter Horse', distance: '3 km away',
    bio: 'Own hat. No mortgage. If a trail has a warning sign, I would like to see where it goes.',
    tags: ['Cowboy energy', 'Wrong turns', 'Big yeehaw'], vibe: 'wild', color: '#d3a25e', mane: '#eed2a0', portrait: 3,
    kicker: 'Zero chill. One hat.', opening: 'This trail says “Do not enter.” Thoughts?',
    choices: [
      { text: 'That sign cannot read us back.', response: 'That is the worst logic I have ever loved.', chemistry: 35 },
      { text: 'Maybe ask a park ranger?', response: 'My only ranger is the open range.', chemistry: 8 },
      { text: 'At least bring emergency carrots.', response: 'You know what? Solid expedition planning.', chemistry: 20 },
    ],
    successLine: 'Two outlaws. One sunset. Absolutely no map.', failLine: 'You rode into different sunsets. Geographically impressive.',
  },
  {
    id: 'lord-oats', name: 'Lord Oats', age: 10, breed: 'Lipizzaner', distance: '5 km away',
    bio: 'I can tell which field my oats came from. Currently seeking a plus-one for the annual hay tasting.',
    tags: ['Old money', 'Oat sommelier', 'Dressage drama'], vibe: 'fancy', color: '#a9adb0', mane: '#e4e1da', portrait: 4,
    kicker: 'A very distinguished neigh.', opening: 'Describe your ideal dinner.',
    choices: [
      { text: 'Whatever falls out of the feed truck.', response: 'You are brave to say that aloud.', chemistry: 8 },
      { text: 'Single-origin oats. Notes of meadow.', response: 'At last. Someone with a developed palate.', chemistry: 35 },
      { text: 'A carrot, cut diagonally.', response: 'Presentation matters. You understand the basics.', chemistry: 20 },
    ],
    successLine: 'Your chemistry has excellent terroir.', failLine: 'He described the chemistry as “slightly under-oated.”',
  },
  {
    id: 'potato', name: 'Potato', age: 5, breed: 'Shetland Pony', distance: '500 m away',
    bio: 'Not tall. Not mysterious. Just round and doing my best. Will lean on you affectionately.',
    tags: ['Pocket-sized', 'Professional napper', 'Big heart'], vibe: 'soft', color: '#9b694d', mane: '#4b3329', portrait: 5,
    kicker: 'Small horse. Enormous feelings.', opening: 'Is it okay if our big adventure is a nap?',
    choices: [
      { text: 'Only after a 12-kilometre hike.', response: 'My legs have filed a formal complaint.', chemistry: 8 },
      { text: 'Can the nap include snacks?', response: 'That is the deluxe package.', chemistry: 20 },
      { text: 'I already found us a sunny spot.', response: 'I have never felt so emotionally supported.', chemistry: 35 },
    ],
    successLine: 'You found your little couch potato.', failLine: 'The spark was missing. The snacks were not.',
  },
  {
    id: 'red-flag', name: 'Red Flag', age: 6, breed: 'Mustang', distance: '6 km away',
    bio: 'My ex said I was unpredictable. Anyway, I have learned to open doors. Up for spontaneous road trips?',
    tags: ['Escape artist', 'No itinerary', 'Probably trouble'], vibe: 'wild', color: '#b96439', mane: '#35251e', portrait: 0,
    kicker: 'The name is a courtesy.', opening: 'I borrowed a horse trailer. Where are we going?',
    choices: [
      { text: 'Somewhere that has not banned you yet.', response: 'So... a long-distance relationship. Love it.', chemistry: 35 },
      { text: 'Back. We need a reservation.', response: 'I am allergic to calendar invites.', chemistry: 8 },
      { text: 'The nearest all-you-can-eat orchard.', response: 'You had me at all-you-can-eat.', chemistry: 20 },
    ],
    successLine: 'The red flags look lovely in the sunset.', failLine: 'Somehow, the warning label was accurate.',
  },
  {
    id: 'clover', name: 'Clover', age: 7, breed: 'Welsh Cob', distance: '2 km away',
    bio: 'Collects pretty leaves. Remembers your birthday. Once cried because a butterfly landed on my nose.',
    tags: ['Hopeless romantic', 'Cloud watcher', 'Leaf collection'], vibe: 'soft', color: '#eee8db', mane: '#e3d2ae', portrait: 1,
    kicker: 'A little luck. A lot of heart.', opening: 'I found this leaf and thought of you.',
    choices: [
      { text: 'Its resale value seems low.', response: 'So does the emotional return on this conversation.', chemistry: 8 },
      { text: 'I am keeping it forever.', response: 'Oh. That made my whole little week.', chemistry: 35 },
      { text: 'It would make an excellent hat.', response: 'It would. You would look very autumnal.', chemistry: 20 },
    ],
    successLine: 'You are now the favorite page in her leaf collection.', failLine: 'A gentle neigh. A respectful goodbye.',
  },
  {
    id: 'night-mare', name: 'Night Mare', age: 8, breed: 'Friesian', distance: '3 km away',
    bio: 'Writes poetry at 2 a.m. Looks intimidating. Actually terrified of plastic bags. Tell no one.',
    tags: ['Dark horse', 'Secret softie', 'Moonlit poetry'], vibe: 'soft', color: '#34312f', mane: '#191b21', portrait: 2,
    kicker: 'Looks scary. Needs a hug.', opening: 'A plastic bag just moved. Did you see that?',
    choices: [
      { text: 'I saw nothing. You are safe with me.', response: 'That is the most romantic thing anyone has said.', chemistry: 35 },
      { text: 'I will challenge it to a duel.', response: 'A bit dramatic. Still, I feel protected.', chemistry: 20 },
      { text: 'I am telling absolutely everyone.', response: 'The next poem is going to be devastating.', chemistry: 8 },
    ],
    successLine: 'She wrote you a poem. It is mostly about bags.', failLine: 'A mysterious exit. The plastic bag remains undefeated.',
  },
  {
    id: 'dolly', name: 'Dolly Trotton', age: 9, breed: 'Palomino', distance: '4 km away',
    bio: 'Big hair. Bigger hospitality. I brought enough carrots for everyone and I expect you to share.',
    tags: ['Golden energy', 'Carrot dealer', 'Big hair'], vibe: 'soft', color: '#d3a25e', mane: '#eed2a0', portrait: 3,
    kicker: 'Your mane source of happiness.', opening: 'There is one carrot left. What do we do?',
    choices: [
      { text: 'Auction it to the highest bidder.', response: 'Honey, this is a picnic, not a hedge fund.', chemistry: 8 },
      { text: 'You have it. I had a big breakfast.', response: 'Sweet. Slightly suspicious. But sweet.', chemistry: 20 },
      { text: 'Split it. The good stuff is for sharing.', response: 'Now that is my kind of stable relationship.', chemistry: 35 },
    ],
    successLine: 'You got the golden heart and half the carrot.', failLine: 'She still packed you a snack for the ride home.',
  },
  {
    id: 'count-canter', name: 'Count Canter', age: 11, breed: 'Lipizzaner', distance: '7 km away',
    bio: 'A connoisseur of the dramatic entrance. Seeking someone who appreciates a well-timed bow.',
    tags: ['Theatrical', 'Perfect posture', 'Five-star hay'], vibe: 'fancy', color: '#a9adb0', mane: '#e4e1da', portrait: 4,
    kicker: 'A walking standing ovation.', opening: 'How should we arrive at the meadow party?',
    choices: [
      { text: 'Very late. Through a cloud of petals.', response: 'You understand the importance of an entrance.', chemistry: 35 },
      { text: 'On time, using the main entrance.', response: 'I am trying to feel something about that.', chemistry: 8 },
      { text: 'Together. With coordinated bow ties.', response: 'A strong supporting costume choice.', chemistry: 20 },
    ],
    successLine: 'A perfect duet. The meadow requests an encore.', failLine: 'The reviews are in. They are mixed.',
  },
  {
    id: 'pocket-rocket', name: 'Pocket Rocket', age: 5, breed: 'Shetland Pony', distance: '800 m away',
    bio: 'Three feet tall. Six feet of attitude. Beat a tractor in a race once. It was parked. Still counts.',
    tags: ['Tiny menace', 'Competitive', 'Snack-powered'], vibe: 'wild', color: '#9b694d', mane: '#4b3329', portrait: 5,
    kicker: 'Fun-sized. Full chaos.', opening: 'Bet you cannot beat me to that fence.',
    choices: [
      { text: 'Aw. Look at your tiny little legs.', response: 'You have made a tiny little enemy.', chemistry: 8 },
      { text: 'You are on. Winner gets the carrots.', response: 'Finally. An opponent with something to lose.', chemistry: 35 },
      { text: 'Only if you give me a head start.', response: 'At last, someone respects the horsepower.', chemistry: 20 },
    ],
    successLine: 'Small pony. Huge chemistry. Concerning speed.', failLine: 'You lost the spark. And possibly the race.',
  },
];

export function evaluateFlirt(horse, choiceIndex, playerMood) {
  const choice = horse?.choices?.[choiceIndex];
  if (!choice) return { chemistry: 0, response: 'Choose your opening line.', good: false };
  const mood = typeof playerMood === 'object' ? playerMood?.id : playerMood;
  const affinity = mood === horse.vibe ? 5 : 0;
  return {
    chemistry: Math.max(0, Math.min(40, choice.chemistry + affinity)),
    response: choice.response,
    good: choice.chemistry >= 30,
  };
}
