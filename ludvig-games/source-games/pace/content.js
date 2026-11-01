(function (root) {
  'use strict';

  var difficulties = {
    easy: { label: 'Easy', description: 'Familiar words. Lowercase. No punctuation.' },
    medium: { label: 'Medium', description: 'Natural sentences, capitals, and punctuation.' },
    hard: { label: 'Hard', description: 'Tricky words, numbers, and mixed punctuation.' }
  };

  // Original practice material. Every character is available on a standard keyboard.
  var passages = {
    easy: [
      'the best way to learn is to take one small step each day',
      'we left the city early and drove down the road to the sea',
      'a warm cup of tea can make a cold morning feel much better',
      'the light came through the window and fell across the desk',
      'give each word a little space and let your hands find a rhythm',
      'she put the book on the table and went outside for a walk',
      'the old dog lay in the sun while the cat slept on the chair',
      'there is still time to make something that you can be proud of',
      'we found a quiet place to sit and watch the boats go past',
      'start with what you know and learn the rest along the way',
      'a good idea often starts with a simple question',
      'the rain stopped just as we reached the front door',
      'keep your eyes on the words and let your fingers do the work',
      'the park was full of people enjoying the last light of the day',
      'my friend made fresh bread and brought some over for lunch',
      'take the next turn and you will see the shop on your left',
      'some days are fast and some are slow but both can move you forward',
      'we moved the plants closer to the window so they could get more light',
      'the small boat crossed the lake as the sun began to rise',
      'a clear plan leaves more room for the things that matter',
      'he checked the map before setting off on the long walk home',
      'the room felt calm with the music low and the door open',
      'each new word is a chance to get a little more comfortable',
      'we spent the afternoon making a game for our friends to play',
      'fresh air and a short break made it easier to begin again',
      'look at how far you have come before you think about what comes next',
      'the bike was waiting by the gate with a light on the front',
      'a clean desk and a clear mind are a good place to start',
      'they took the train to town and walked the rest of the way',
      'we had enough time to stop for coffee before the meeting',
      'the path went past a small house and down towards the water',
      'listen to the sound of the keys and settle into a steady pace',
      'the meal was simple but everyone asked for a little more',
      'new habits grow when you give them a place in your day',
      'she wrote a short note and left it beside the blue cup',
      'we can try a different route and see where it takes us',
      'the first few steps can feel strange before they start to feel easy',
      'good work takes care and a little time to get the details right',
      'the bus arrived early so we had to run to catch it',
      'small changes can make a big difference over a long time'
    ],
    medium: [
      'A good morning begins with enough time to think.',
      'We took the longer route home, just to see the water.',
      'The first version does not have to be the final version.',
      'Keep your pace steady, and let each word fall into place.',
      'She opened the window and listened to the city wake up.',
      'There was a small cafe at the end of the quiet street.',
      'Write a clear message, then check the details before you send it.',
      'We booked a table near the window for Friday evening.',
      'Sometimes the most useful change is the simplest one.',
      'The train was late, but we still arrived before the rain.',
      'Every afternoon, the sunlight moves across the wooden floor.',
      'A short break can help you return with a fresh perspective.',
      'Make room for practice, even when the rest of the day feels busy.',
      'The team shared a few ideas and agreed on the next step.',
      'She saved the file, closed her laptop, and went for a walk.',
      'We found the missing key in the pocket of an old coat.',
      'The garden looked different after a week of warm weather.',
      'Take a moment to read the whole sentence before you begin.',
      'At the corner, turn left and follow the path beside the river.',
      'The new design makes the most common action easier to find.',
      'A small notebook can hold more useful ideas than you expect.',
      'He checked the list twice before leaving for the station.',
      'Start slowly enough to stay accurate, then build your speed.',
      'We spent the weekend exploring a part of town we rarely visit.',
      'The coffee was still warm when the meeting finally ended.',
      'There is a difference between moving quickly and feeling rushed.',
      'After lunch, we walked to the park and sat under a tall tree.',
      'The message was short, friendly, and easy to understand.',
      'Leave a little space between one task and the next.',
      'She found a better solution after asking one more question.',
      'The last boat crossed the bay as the sky turned orange.',
      'If something feels difficult, break it into smaller steps.',
      'A familiar song was playing softly in the room next door.',
      'We moved the meeting to Monday so everyone could attend.',
      'Notice the words that slow you down, and give them another try.',
      'The best part of the trip was a place we had not planned to visit.',
      'He placed the shopping bags on the counter and put the kettle on.',
      'Choose a pace you can maintain from the first word to the last.',
      'The library was quiet, except for the sound of turning pages.',
      'We tested the idea with a few people before making it bigger.'
    ],
    hard: [
      'The appointment is at 10:30; please arrive 15 minutes early.',
      '"Definitely" has no letter a, even when your fingers disagree.',
      'We received 27 responses, but only 19 included a complete address.',
      'The new prototype (version 2.4) is ready for a detailed review.',
      'It is necessary to separate the original files from the duplicates.',
      'She asked, "Could you send the revised schedule before Thursday?"',
      'A quiet environment will not solve every problem, but it helps.',
      'The reservation includes breakfast, Wi-Fi, and a 12:00 checkout.',
      'You can change your approach without abandoning your original goal.',
      'The committee recommended a separate entrance for deliveries.',
      '"That is an interesting possibility," he said, "but what comes next?"',
      'We should accommodate different preferences without adding confusion.',
      'The package weighs 3.5 kg and measures 40 cm across its longest side.',
      'Her explanation was concise, practical, and surprisingly reassuring.',
      'I would rather ask a straightforward question than make an assumption.',
      'The receipt shows 4 items: a notebook, a pen, a folder, and a ruler.',
      'Please double-check the recipient before sending confidential details.',
      'The restaurant opens at 17:00 on weekdays and 16:30 on Saturdays.',
      'You do not need extraordinary motivation to build an ordinary habit.',
      'The designer adjusted the spacing by 8 pixels, then tested it again.',
      'An unexpected interruption does not have to derail the entire afternoon.',
      '"Is this the correct address?" she asked, comparing the 2 envelopes.',
      'The final paragraph needs a clearer transition and fewer adjectives.',
      'A successful experiment can reveal why an unsuccessful attempt failed.',
      'We budgeted $75 for supplies; the actual total came to $68.50.',
      'The instructions should be understandable without additional assistance.',
      'I cannot remember whether we agreed on September 12 or September 21.',
      'Keep the terminology consistent, especially across related documents.',
      'The forecast predicts a 40% chance of rain after 18:00.',
      'Their recommendation was reasonable, although the timing was awkward.',
      'She made 3 changes: simplify the form, clarify the labels, and test it.',
      '"Practice makes progress" sounds simple; consistency is the difficult part.',
      'We should distinguish between a temporary workaround and a permanent fix.',
      'The visitor could not remember the password, so we sent a new invitation.',
      'The measurements were approximately correct, but precision mattered here.',
      'Choose the available option that meets your immediate requirements.',
      'He transferred 250 files into a separate folder before updating the system.',
      'A misplaced apostrophe can change the meaning of an otherwise clear sentence.',
      'The document contains 1,250 words, including the introduction and conclusion.',
      'You will occasionally make mistakes; correct them, then continue with care.'
    ]
  };

  var accuracyPassages = {
    easy: [
      'we took a short walk by the water before heading home the air was cool and the streets were quiet a light was on in the small shop near the bridge so we stopped to buy some bread for dinner',
      'start with a slow and steady pace give every word enough time to feel clear your hands will learn the pattern as you go a few careful minutes today can make the next round feel a little easier',
      'the sun came through the window and made a bright square on the floor she moved her chair into the light and opened a book there was still an hour before lunch and no need to hurry',
      'we built a small game for our friends to play each person took a turn and tried to beat their own score by the end of the day everyone had found a new way to get a little better'
    ],
    medium: [
      'The best practice is the kind you can return to. Choose a comfortable pace, notice the details, and keep going. A few focused minutes can become a useful part of an otherwise busy day.',
      'We planned to walk straight home after work. Instead, we took a turn by the river and found a quiet place to sit. The extra ten minutes made the evening feel much longer, in a good way.',
      'A clear message gives the reader enough information to act. Start with the main point, explain what matters, and leave out the rest. Before you send it, take a moment to read it again.',
      'She saved the first draft and stepped away from her desk. When she came back, the next change was obvious. Sometimes a short break gives you the distance you need to see the answer.'
    ],
    hard: [
      '"Have we received the revised schedule?" she asked. The appointment was set for 10:30, but the confirmation mentioned 11:15. We checked the original message before making unnecessary changes.',
      'The experiment produced 3 useful results: fewer interruptions, clearer instructions, and a 12% reduction in errors. It was not a perfect solution, but it was a measurable improvement.',
      'Please keep the original files in a separate folder (version 2.4). The revised document includes 27 corrections, most of which address inconsistent terminology and occasionally confusing punctuation.',
      'We definitely need to accommodate the new requirements. The deadline is September 21; that gives us approximately 3 weeks to review the details, test the changes, and confirm everything works.'
    ]
  };

  var lessons = [
    {
      id: 1, title: 'Small steps', description: 'Settle into a comfortable rhythm.',
      difficulty: 'easy', targetWpm: 12, targetAccuracy: 85, duration: 0,
      text: 'take your time and find a steady pace each small step will help your hands learn the way keep your eyes on the words and let the keys feel easy'
    },
    {
      id: 2, title: 'Keep moving', description: 'Link familiar words together.',
      difficulty: 'easy', targetWpm: 16, targetAccuracy: 88, duration: 0,
      text: 'we left the house early and walked to the park the sun was out and the air felt cool a small dog ran past the gate while we sat down near the lake'
    },
    {
      id: 3, title: 'Find a rhythm', description: 'Build consistency across longer lines.',
      difficulty: 'easy', targetWpm: 20, targetAccuracy: 90, duration: 0,
      text: 'a good habit starts with a little time and a clear reason to begin you do not need to rush through every word let your hands move at a pace you can keep from the first line to the last'
    },
    {
      id: 4, title: 'Common mix-ups', description: 'Give similar words a little more care.',
      difficulty: 'easy', targetWpm: 24, targetAccuracy: 92, duration: 0,
      text: 'their friends were already there when we arrived we brought more food than we needed and then stayed longer than we planned there was still enough light to walk home after the meal'
    },
    {
      id: 5, title: 'A capital idea', description: 'Add capitals and full stops.',
      difficulty: 'medium', targetWpm: 28, targetAccuracy: 94, duration: 0,
      text: 'Every morning is a chance to start again. Make a little room for the things you want to improve. Keep your attention on the next word. The rest will follow with practice.'
    },
    {
      id: 6, title: 'Room to pause', description: 'Keep your flow through commas.',
      difficulty: 'medium', targetWpm: 32, targetAccuracy: 94, duration: 0,
      text: 'Before you leave, check the time and take a look outside. If the weather is clear, you can walk along the river. Otherwise, the bus stops just around the corner. Either way, there is no need to rush.'
    },
    {
      id: 7, title: 'Say it clearly', description: 'Type a complete everyday message.',
      difficulty: 'medium', targetWpm: 36, targetAccuracy: 95, duration: 0,
      text: 'Thanks for sending the updated design. The layout is much easier to follow, and the main action is clear. Could we review the final changes tomorrow? I will bring a few notes so we can agree on the next steps.'
    },
    {
      id: 8, title: 'Tricky spelling', description: 'Slow down for commonly mistyped words.',
      difficulty: 'medium', targetWpm: 40, targetAccuracy: 95, duration: 0,
      text: 'We definitely need a separate place to keep the original documents. Please confirm that you received the invitation and remember to include your preferred time. It is necessary to check these details before we continue.'
    },
    {
      id: 9, title: 'By the numbers', description: 'Mix words, times, and numbers.',
      difficulty: 'hard', targetWpm: 45, targetAccuracy: 96, duration: 0,
      text: 'The workshop starts at 09:30 and ends at 12:15. We have reserved 24 seats, but only 19 people have confirmed. Please arrive 10 minutes early and bring a notebook. The entrance is on the 2nd floor, beside room 204.'
    },
    {
      id: 10, title: 'Punctuation run', description: 'Handle quotes and punctuation cleanly.',
      difficulty: 'hard', targetWpm: 50, targetAccuracy: 97, duration: 0,
      text: '"Is this the final version?" she asked. "Almost; I still need to double-check the details." The document (version 3.2) included a revised introduction, 4 examples, and a short conclusion. Everything was ready for one last review.'
    },
    {
      id: 11, title: 'Under control', description: 'Stay precise through complex sentences.',
      difficulty: 'hard', targetWpm: 56, targetAccuracy: 97, duration: 0,
      text: 'The committee recommended 3 changes: accommodate different preferences, simplify unnecessary requirements, and communicate the schedule clearly. Their explanation was straightforward; the difficult part was maintaining consistency across approximately 250 separate documents.'
    },
    {
      id: 12, title: 'Full flow', description: 'Bring speed and accuracy together.',
      difficulty: 'hard', targetWpm: 65, targetAccuracy: 98, duration: 0,
      text: '"Progress is not always immediate," she explained, "but consistency makes a difference." After 12 sessions, the team reduced its error rate by 18%. The approach was simple: identify recurring mistakes, practice deliberately, and review the results without making unnecessary assumptions.'
    }
  ];

  var trickyWords = [
    'receive', 'separate', 'necessary', 'definitely', 'because', 'different',
    'available', 'remember', 'believe', 'occasionally', 'environment', 'address',
    'beginning', 'successful', 'immediately', 'schedule', 'tomorrow', 'preferred'
  ];

  function hashSeed(value) {
    var text = String(value);
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    var state = hashSeed(seed);
    return function () {
      state += 0x6D2B79F5;
      var value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffled(items, random) {
    var output = items.slice();
    for (var i = output.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var item = output[i];
      output[i] = output[j];
      output[j] = item;
    }
    return output;
  }

  function practiceWords(missedWords, random) {
    var unique = [];
    (Array.isArray(missedWords) ? missedWords : []).forEach(function (entry) {
      var candidate = typeof entry === 'string' ? entry : entry && entry.word;
      if (typeof candidate !== 'string') return;
      candidate = candidate.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toLowerCase();
      if (!/^[a-z0-9]+(?:['-][a-z0-9]+)*$/.test(candidate)) return;
      if (candidate.length < 2 || candidate.length > 35 || unique.indexOf(candidate) !== -1) return;
      unique.push(candidate);
    });
    return shuffled(unique.length ? unique.slice(0, 16) : trickyWords, random);
  }

  function generateWeakness(missedWords, random, difficulty) {
    var words = practiceWords(missedWords, random);
    var groups = [];
    var pointer = 0;
    var templates = difficulty === 'easy' ? [
      function (a, b) { return 'take your time with ' + a + ' and then write ' + b; },
      function (a, b) { return 'look at ' + a + ' before you move on to ' + b; },
      function (a, b) { return 'try ' + a + ' again and keep a steady pace with ' + b; },
      function (a, b) { return 'give ' + a + ' some care and finish with ' + b; }
    ] : [
      function (a, b) { return 'Take your time with "' + a + '", then write "' + b + '".'; },
      function (a, b) { return 'Look at "' + a + '" before you move on to "' + b + '".'; },
      function (a, b) { return 'Try "' + a + '" again, and keep a steady pace with "' + b + '".'; },
      function (a, b) { return 'Give "' + a + '" some care, and finish with "' + b + '".'; }
    ];
    // Every selected weakness appears at least twice, so a drill is useful even
    // when the list contains more than a handful of words.
    while (pointer < Math.max(words.length * 2, 8)) {
      var a = words[pointer % words.length];
      var b = words[(pointer + 1) % words.length];
      groups.push(templates[(pointer / 2) % templates.length](a, b));
      pointer += 2;
    }
    return groups.join(' ');
  }

  function generateText(options) {
    options = options || {};
    var difficulty = difficulties[options.difficulty] ? options.difficulty : 'easy';
    var mode = options.mode || 'sprint';
    var random = options.seed === null || options.seed === undefined ? Math.random : seededRandom(options.seed);

    if (options.levelId !== null && options.levelId !== undefined && mode === 'lesson') {
      var lesson = lessons.find(function (item) { return item.id === Number(options.levelId); });
      if (lesson) return lesson.text;
    }
    if (mode === 'accuracy') {
      var choices = accuracyPassages[difficulty];
      return choices[Math.floor(random() * choices.length)];
    }
    if (mode === 'weakness' || mode === 'mistakes' || mode === 'focus') {
      return generateWeakness(options.missedWords || [], random, difficulty);
    }

    var sentences = shuffled(passages[difficulty], random);
    var output = [];
    var length = 0;
    var cursor = 0;
    while (length < 2000) {
      if (cursor >= sentences.length) {
        sentences = shuffled(passages[difficulty], random);
        cursor = 0;
      }
      var sentence = sentences[cursor];
      output.push(sentence);
      length += sentence.length + (output.length > 1 ? 1 : 0);
      cursor += 1;
    }
    return output.join(' ');
  }

  function getDaily(dateKey) {
    var seed = 'pace-daily-' + String(dateKey);
    return {
      seed: seed,
      title: 'The daily minute',
      description: 'One minute. A fresh passage every day.',
      difficulty: 'medium',
      duration: 60,
      text: generateText({ difficulty: 'medium', mode: 'daily', seed: seed })
    };
  }

  var api = {
    difficulties: difficulties,
    lessons: lessons,
    trickyWords: trickyWords,
    generateText: generateText,
    getDaily: getDaily
  };
  root.PaceContent = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
