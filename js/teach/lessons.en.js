// The six lessons in English: only the words, keyed by lesson id and step
// index. Everything else (scenes, answers, checks, pictures) comes from
// lessons.js; js/i18n.js lays these words over it. tests/i18n.test.js keeps
// the two step for step.

/** @import { LessonText } from "./types.js" */

const CREDIT = {
  sancai: { alt: "A picture from an old Chinese book: a wooden man on a stand, one arm stretched out", credit: "From the Sancai Tuhui, compiled by Wang Qi and Wang Siyi (Ming dynasty, 1609). Public domain, Wikimedia Commons" },
  museum: { alt: "A wooden model of a south-pointing chariot, with the wooden man on top pointing. This model uses the differential design", credit: "South-pointing chariot model (differential design), Science Museum, London. Photo: Andy Dingley, CC BY 3.0, Wikimedia Commons" },
  gears: { alt: "A stack of gears inside a model chariot, beside an upright shaft", credit: "Gears of a reconstructed south-pointing chariot, National Museum of Natural Science, Taiwan. Photo: SSR2000, CC BY-SA 3.0, Wikimedia Commons" },
};

/** @type {Record<string, LessonText>} */
export const LESSONS_EN = {
  what: {
    title: "What is the south-pointing chariot?",
    summary: "A cart with a wooden man who always points south.",
    steps: [
      { text: "This is the <b>south-pointing chariot</b>.\n\nA little wooden man stands on top. His arm is stretched out, pointing south." },
      {
        text: "Watch the chariot weave left and right.\n\nWhere is his hand pointing? Look closely.",
        task: {
          prompt: "After the chariot turns, where does the man point?",
          options: ["Wherever the chariot faces", "Still south", "All over the place"],
          right: "Yes! However the chariot turns, he points south.",
          wrong: "Watch again — keep your eyes on his hand.",
        },
      },
      {
        text: "Legend says that long, long ago the Yellow Emperor was fighting a battle in thick fog. His soldiers couldn't tell which way was which, so he built a south-pointing chariot.\n\nThat's only a legend. The first real instructions for building one are in a history of the Song dynasty, called the <em>History of Song</em>.",
        picture: CREDIT.sancai,
      },
      {
        text: "So is it a compass?\n\n<b>Nope!</b> A compass has a magnetic needle inside. A magnet makes it point south.\n\nThe chariot has <b>no magnets at all</b> — only wooden gears.",
        task: {
          prompt: "What makes the chariot point south?",
          options: ["Magnets", "Gears", "The wind"],
          right: "Right! It's a gear machine.",
          wrong: "There are no magnets in it. Try again?",
        },
      },
      { text: "Old books also mention a <em>sinan</em>, or “south-governor”. People think it was a little spoon carved from lodestone, a rock that is naturally magnetic.\n\nThe chariot was sometimes called the <em>sinan chariot</em> too. Similar names, totally different machines: the sinan uses a magnet, the chariot uses gears." },
      {
        text: "So how does it find south?\n\nThe secret is hidden inside the cart. Press <b>X-ray</b> to see what's in there.",
        task: { prompt: "Press “X-ray” and look inside the cart", done: "See? It's packed with gears!" },
      },
    ],
  },

  drive: {
    title: "Take the reins",
    summary: "You drive. Watch where the man points.",
    steps: [
      {
        text: "Now <b>you're the driver</b>!\n\nUse the arrow buttons to drive forward.",
        task: { prompt: "Drive forward a little way", done: "Smooth driving!" },
      },
      {
        text: "Now turn left.\n\nKeep an eye on the man's hand while you turn.",
        task: { prompt: "Drive and turn left", done: "The chariot turned. The man still points south!" },
      },
      {
        text: "Now turn right.",
        task: { prompt: "Drive and turn right", done: "Still south. Pretty clever, huh?" },
      },
      {
        text: "Here's a tricky one: turn right round and drive back the way you came.",
        task: { prompt: "Turn the chariot to face backwards", done: "You turned it right round, and he still points south." },
      },
      {
        text: "Draw a twisty road on the ground.\n\nThe chariot will follow your road.",
        task: { prompt: "Draw a road and let the chariot drive it", done: "However twisty the road, he never gets lost." },
      },
      {
        text: "The chariot keeps changing direction. The man doesn't.\n\nHow does he know where south is? Next, let's look at the wheels.",
        task: {
          prompt: "However you drive, what does the man do?",
          options: ["Always points south", "Always points where the chariot faces", "Always points backwards"],
          right: "Yes! That's the chariot's superpower.",
          wrong: "Think back: which way did he point while you were driving?",
        },
      },
    ],
  },

  wheels: {
    title: "Two wheels on a turn",
    summary: "On a turn, the outside wheel goes further.",
    steps: [
      {
        text: "Forget the chariot for a moment.\n\nTwo kids are holding hands and walking round in a circle. One is on the inside, the other is on the outside.",
        task: { prompt: "Make the two kids walk a lap", done: "One lap done!" },
      },
      {
        text: "Count their footprints.\n\nThey finished the lap together. The inside circle is small; the outside circle is big.",
        task: {
          prompt: "Who walked further?",
          options: ["The kid on the inside", "The kid on the outside", "Both the same"],
          right: "Yes! The outside circle is bigger, so it's a longer walk.",
          wrong: "Compare the two circles. Which one is longer?",
        },
      },
      { text: "A chariot's two wheels work the same way.\n\nWhen it drives straight, the <span class=\"l\">left wheel</span> and the <span class=\"r\">right wheel</span> roll exactly the same distance." },
      {
        text: "Now the chariot drives a circle to the left.\n\nThe <span class=\"l\">left wheel</span> is on the inside, the <span class=\"r\">right wheel</span> is on the outside. Watch how far each one rolls.",
        task: {
          prompt: "Which wheel rolls further?",
          options: ["The blue left wheel", "The orange right wheel", "Both the same"],
          right: "Yes! The right wheel is on the outside, so it rolls further.",
          wrong: "Remember the kids holding hands — who was on the outside?",
        },
      },
      { text: "The chariot can even spin on the spot.\n\nThen the <span class=\"l\">left wheel</span> rolls backwards while the <span class=\"r\">right wheel</span> rolls forwards. That's as different as the two wheels ever get." },
      {
        text: "<b>Remember:</b> the more the chariot turns, the bigger the difference between its two wheels.\n\nIt works the other way round too: if you know how much further one wheel went, you know how far the chariot turned.",
        task: { prompt: "Turn right and see which wheel goes further", done: "This time the left wheel is on the outside, so it goes further!" },
      },
    ],
  },

  gears: {
    title: "Gears that keep count",
    summary: "The gears count the difference between the wheels, then turn the man back.",
    steps: [
      {
        text: "The gears inside the chariot are like a bookkeeper.\n\nA bookkeeper writes every number down, one by one. These gears keep track of how many times each wheel has turned.",
        picture: CREDIT.gears,
      },
      { text: "The <span class=\"l\">left wheel</span> turns one gear, and the <span class=\"r\">right wheel</span> turns another.\n\nWhen a wheel turns once, its gear turns once too. But the two gears turn in opposite directions." },
      { text: "Between those two gears sit some small gears. The small gears ride on a carrier, and the wooden man stands on that carrier.\n\nWhen the chariot drives straight, both wheels turn the same amount. The two sides cancel out: the carrier stays still, and so does the man." },
      {
        text: "When the chariot turns, the outside wheel turns more.\n\nThose extra turns swing the carrier, and the man on it, <b>backwards</b>.",
        task: {
          prompt: "The chariot turns left. Which way does the man turn on top of it?",
          options: ["Left as well", "Right, back the other way", "He doesn't move"],
          right: "Yes! He turns the opposite way, exactly undoing the chariot's turn.",
          wrong: "If he turned along with the chariot, he'd stop pointing south. Think again?",
        },
      },
      { text: "The chariot just made two turns and ended up facing the other way. The outside wheel turned <b>one whole turn more</b> than the inside one.\n\nThe chariot turned half a circle, so the man turned half a circle backwards — and he still points south." },
      {
        text: "Drag the “Take the gears apart” slider to the right, and the gears will come apart one by one.",
        task: { prompt: "Drag the slider all the way right and look at each gear", done: "All the gears are apart. Can you see how they fit together?" },
      },
      { text: "<b>However far the chariot turns, the man turns back just as far.</b>\n\nSo to someone standing on the ground, he never seems to move at all. He just keeps pointing south." },
    ],
  },

  "two-ways": {
    title: "Two ways to build it",
    summary: "The chariot in the history book, and the one an engineer guessed.",
    steps: [
      {
        text: "The gears you just saw are called a <b>differential</b>: they work out the <em>difference</em> between the two wheels.\n\nBut is this really how it was built long ago? The honest answer: we <b>don't know for sure</b>.",
        picture: CREDIT.museum,
      },
      { text: "The <em>History of Song</em> records how two men built theirs.\n\nYan Su built one in 1027. Wu Deren built another in 1107. The book says how big the gears were and how many teeth they had." },
      {
        text: "Let's look at Yan Su's chariot. Press <b>Song dynasty</b> to swap in a different set of gears.",
        task: { prompt: "Switch to “Song dynasty”", done: "This is Yan Su's design." },
      },
      {
        text: "Beside each wheel stands an upright wheel with 24 teeth.\n\nOn each side there's a small flat wheel with 12 teeth. In the middle is the big flat wheel, with 48 teeth. Its shaft runs up through the roof, and the wooden man stands on top.",
        task: {
          prompt: "How many teeth does the big flat wheel have?",
          options: ["12", "24", "48"],
          right: "Yes! The History of Song says 48 teeth.",
          wrong: "The big flat wheel is the biggest, so it has the most teeth. Count again?",
        },
      },
      { text: "Going straight, both small flat wheels are lifted up, and the man stays still.\n\nOn a turn, the pole swings to one side and the outside small wheel drops down. That links the outside road wheel to the big flat wheel." },
      { text: "When a road wheel turns once, all 24 teeth of its upright wheel push past. That turns the small flat wheel twice, and the big flat wheel half a turn.\n\nOn a right-angle turn, the outside wheel turns half a turn. The big flat wheel moves 12 teeth — a quarter turn. That's exactly what the <em>History of Song</em> says." },
      {
        text: "Later, people did the maths and found Yan Su's chariot had a catch: on every turn, the inside wheel has to <b>stay still</b> while the chariot swings round it.\n\nThe driver had to steer just like that, or the man wouldn't point true. This time <b>Driver helps</b> is already off, and the chariot drives a big, sloppy circle.",
        task: {
          prompt: "With “Driver helps” off, does the man still point south after a lap?",
          options: ["Still south", "He's pointing the wrong way"],
          right: "Right — Yan Su's chariot only points true if the driver plays along. Switch “Driver helps” on and press Watch again to compare.",
          wrong: "Look where he's pointing at the end.",
        },
      },
      { text: "Wu Deren's chariot had even more gears; its big flat wheel had 100 teeth.\n\nBut the book never says clearly how all those gears connect. Nobody has worked it out for certain, even today." },
      {
        text: "So who came up with the differential? A British engineer, George Lanchester, in the 1940s. He worked it out from how the machine would have to behave.\n\nThe old books <b>never</b> mention a differential, but it points true however you drive. That's why this page starts with it — and you can switch to the Song dynasty gears to compare.",
        task: {
          prompt: "Which of these is true?",
          options: ["The History of Song describes the differential", "The differential is a modern guess", "We know exactly how it was built long ago"],
          right: "Yes! The History of Song describes Yan Su's design; the differential was guessed much later.",
          wrong: "Look back: which design is in the old books?",
        },
      },
    ],
  },

  errors: {
    title: "Can it go wrong?",
    summary: "Wonky wheels or a slippery road send the man off south.",
    steps: [
      { text: "Does a differential chariot stay accurate however far it goes?\n\nYes — as long as it's built exactly right. But what if something is a little bit off?" },
      {
        text: "What if the wheels are set a little too far apart…\n\nThe gears were made for the original width, so the count comes out wrong. The chariot is only a tiny bit wider, yet after one lap the man is way off. The more laps, the further off he gets.",
        task: {
          prompt: "After lots of laps, what happens to the man?",
          options: ["He gets further and further off", "He fixes himself", "Nothing changes"],
          right: "Right — every lap's mistake adds up.",
          wrong: "He drifts a bit every lap. What happens when you add those up?",
        },
      },
      { text: "What if one wheel is a bit bigger than the other…\n\nOver the same distance, the big wheel turns fewer times and the small wheel turns more. The gears think the chariot is turning. It's driving dead straight, but the man slowly swings away." },
      { text: "What if the ground is slippery and one wheel spins…\n\nThe wheel turns lots of times, but the chariot doesn't go that far. The gears get fooled again." },
      {
        text: "Your turn: give the chariot a flaw and knock the man off south.",
        task: { prompt: "Pick a flaw, then drive until the man points the wrong way", done: "He's off! That's the kind of mistake a machine makes." },
      },
      {
        text: "Now fix the flaw so the chariot points true again.",
        task: { prompt: "Fix the flaw", done: "Fixed! You'd make a fine craftsman." },
      },
      {
        text: "A compass doesn't care about slipping. Its magnetic needle points north and south, and the wheels have nothing to do with it.\n\nThe chariot has no magnet. It's just <b>counting</b> how many times its wheels turn. Count wrong, and it points wrong.",
        task: {
          prompt: "After the wheel slips, which one still points south?",
          options: ["The chariot", "The compass"],
          right: "Yes! The compass uses a magnet, so slipping can't fool it.",
          wrong: "Slipping can fool gears, but it can't fool a magnet.",
        },
      },
      { text: "One old book even says a south-pointing chariot once had a person hiding inside, secretly turning the man!\n\nA real south-pointing chariot needs no tricks. It counts with gears. That's what makes it such an amazing machine." },
    ],
  },
};
