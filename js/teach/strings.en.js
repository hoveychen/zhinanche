// The English page copy: strings.js, key for key (tests/i18n.test.js).
// Distances are shown in metres (design/decisions/0002-english-units.md).

import { CHI_IN_METERS } from "../sim/params.js";
import { fmt } from "./strings.js";

/** @import { Strings } from "./strings.js" */

/** @param {number} chi */
const m = (chi) => fmt(chi * CHI_IN_METERS);

/** @type {Strings} */
export const STR_EN = {
  landmarkPlaque: "南",

  page: {
    htmlLang: "en",
    title: "South-Pointing Chariot: no magnets, just gears",
    description: "Drive a 3D model of China's ancient south-pointing chariot, draw it a road, X-ray it and pull its gears apart to see why the little wooden man always points south. Six short lessons for curious kids (and grown-ups).",
  },

  bar: {
    brand: "South\u2011Pointing Chariot",
    tabsLabel: "Pages",
    tabHome: "Lessons",
    tabFree: "Drive",
    stageLabel: "The chariot",
    panelLabel: "Lessons",
    loading: "Wheeling the chariot out…",
    loadFailed: "The chariot got stuck on the way out. Please reload the page and try again.",
    langButton: "中文",
    langLabel: "切换到中文",
  },

  home: {
    kicker: "A 1,000-year-old gear machine",
    title: "The South\u2011Pointing Chariot",
    hook: "No magnets. Just wooden gears. Turn the chariot any way you like — the little wooden man keeps pointing south. How?",
    drive: "Take it for a drive",
    start: "Start at lesson 1",
    askHead: "People always ask",
    lessonsHead: "Six short lessons",
  },

  asks: [
    { q: "Does it ever drift?", a: "Build one wheel a hair too big, or let one slip, and the man slowly points the wrong way. The Song dynasty chariot drifts a little too, after many turns.", lesson: 6, step: 2 },
    { q: "Is this really how they built it?", a: "A Song-dynasty history book describes one design; a 20th-century engineer guessed another. You can drive both — the Song one drifts a little after many turns.", lesson: 5, step: 1 },
  ],

  stage: {
    hook: "The chariot turns. His hand stays on the South Gate.",
    dragHint: "Drag to look around",
    drawHint: "Draw a road on the ground. Let go and the chariot sets off.",
    sceneLabel: "3D view of the south-pointing chariot",
    demoCount: (inner, outer) => `Inside: ${inner} steps · Outside: ${outer} steps`,
  },

  ui: {
    pause: "Pause",
    resume: "Play",
    pauseKey: "Space bar",
    paused: "Paused",
    pausedHow: "Press Play or the space bar to carry on",
    moreBelow: "More",
    sheetOpen: "More to try: break it, X-ray it, take it apart",
    sheetClose: "Close",
    modelFailed: "This chariot got stuck on the way out. Please reload the page and try again.",
  },

  share: {
    copy: "Copy link",
    copied: "Copied!",
    hint: "Saves the gears, the switches and the road you drew into a link: whoever opens it sees the same chariot drive the same road",
    manual: "Couldn't copy it. Here's the link to copy yourself:",
  },

  about: {
    source: "Source code",
    license: "Open source, Apache-2.0",
  },

  free: {
    title: "Free drive",
    howDrive: "Hold an arrow button to drive, or use the arrow keys.",
    howDraw: "Press “Draw a road” and sketch one on the ground — the chariot will follow it. Tap a gear to find out what it's called.",
    breakHead: "Try to break it",
    breakNote: "Give the chariot a flaw, drive a lap, and see if the man still points at the South Gate.",
    gearsOn: "See the gears",
    gearsOff: "Back out",
  },

  course: {
    numeral: (i) => String(i + 1),
    kicker: (i) => `Lesson ${i + 1}`,
    askGo: (i) => `Lesson ${i + 1} →`,
    stepsLabel: (k, n) => `Step ${k} of ${n}`,
    replay: "Watch again",
    guessNote: "Make a guess. Then you'll see it happen.",
    walk: "Walk them round",
    walkAfterGuess: "Pick an answer first",
    navLabel: "Steps",
    back: "Back",
    next: "Next",
    nextLesson: "Next lesson",
    toc: "All lessons",
  },

  drive: {
    up: "Go",
    down: "Reverse",
    left: "Left",
    right: "Right",
    padLabel: "Drive: hold an arrow button, or use the arrow keys",
    draw: "Draw a road",
  },

  hud: {
    north: "N",
    east: "E",
    west: "W",
    south: "S",
    onSouth: "Pointing due south",
    offSouth: (deg) => `${deg}° off south`,
    num: (chi) => m(chi),
    unit: "m",
    sub: (_chi) => "",
    wheelL: "Left",
    wheelR: "Right",
    odoLabel: "How far each wheel has rolled (tap to fold or unfold)",
    same: "Both wheels rolled the same",
    opposite: "The wheels roll opposite ways",
    rightMore: (chi) => `Right wheel: ${m(chi)}\u00a0m more`,
    leftMore: (chi) => `Left wheel: ${m(chi)}\u00a0m more`,
  },

  tools: {
    label: "Tools",
    mechanism: "Gears",
    differential: "Differential",
    differentialHint: "A modern guess at the gears",
    song: "Song dynasty",
    songHint: "Yan Su's design, from the History of Song",
    assistBlock: "Driving the Song chariot",
    assist: "Driver helps",
    assistOff: "Only works with the Song dynasty gears.",
    assistOn: "On every turn the driver holds the inside wheel still and swings the chariot round it. Each turn the teeth have to line up again and land a tiny bit off, so after many turns the man drifts a few degrees.",
    assistNone: "The driver stops helping — the chariot turns any old way.",
    faults: "Flaws",
    faultsBlock: "Is it built true?",
    faultNone: "Just right",
    faultTrack: "Wheels too wide",
    faultTrackHint: "The two wheels are set a little too far apart",
    faultWheel: "Big left wheel",
    faultWheelHint: "One wheel is a bit bigger than the other",
    ground: "Ground",
    noSlip: "Grippy",
    slipR: "Right wheel slips",
    xrayBlock: "Look inside",
    xray: "X-ray",
    explodeBlock: "Take the gears apart",
    explode: "How far apart",
    together: "Together",
    apart: "Apart",
    speed: "Speed",
    slow: "Slow",
    normal: "Normal",
    fast: "Fast",
    resetBlock: "Start over",
    reset: "Reset the chariot",
  },

  scene: {
    north: "N",
    east: "E",
    west: "W",
    south: "S",
    plaqueSub: "SOUTH",
    compass: "Compass: a magnetic needle",
    inner: "Inside",
    outer: "Outside",
  },

  parts: {
    teeth: (n) => `${n} teeth`,
    pegs: (n) => `; inside it, a ring of ${n} upright teeth that grip the small gears`,
    names: {
      // both chariots
      "差动式：现代人猜的": "Differential chariot: a modern guess",
      "宋史式：燕肃的车": "Song dynasty chariot: Yan Su's design",
      "齿轮室的顶板": "Gear room's ceiling",
      "重台（上层箱体和镂拱）": "Upper tier (the second box and its bracket band)",
      "顶上的平台和勾阑（仙人站在这里）": "Top platform and railing (the immortal stands here)",
      "前车厢板": "Front panel",
      "后车厢板": "Back panel",
      "左侧车厢板": "Left side panel",
      "右侧车厢板": "Right side panel",
      "车架": "Frame",
      "车辕": "Pole (the animal is hitched here)",
      "车轴": "Axle",
      "木人": "The wooden man",
      "竖轴（木人站在顶上）": "Upright shaft (the man stands on top)",
      "左车轮": "Left wheel",
      "右车轮": "Right wheel",
      "左车轮的记号辐条": "Left wheel's marked spoke",
      "右车轮的记号辐条": "Right wheel's marked spoke",
      // differential
      "左轮带的竖齿轮": "Left wheel's upright gear",
      "右轮带的竖齿轮": "Right wheel's upright gear",
      "左轮带的竖齿轮上的记号": "Mark on the left wheel's upright gear",
      "右轮带的竖齿轮上的记号": "Mark on the right wheel's upright gear",
      "左边的平齿轮（下层）": "Left flat gear (bottom)",
      "右边的平齿轮（上层）": "Right flat gear (top)",
      "左边的平齿轮（下层）上的记号": "Mark on the left flat gear (bottom)",
      "右边的平齿轮（上层）上的记号": "Mark on the right flat gear (top)",
      "小齿轮": "Small gear",
      "小齿轮上的记号": "Mark on a small gear",
      "架子（木人就站在它上面）": "Carrier (the wooden man stands on it)",
      // Song
      "左立子轮": "Left upright wheel",
      "右立子轮": "Right upright wheel",
      "左立子轮上的记号": "Mark on the left upright wheel",
      "右立子轮上的记号": "Mark on the right upright wheel",
      "左小平轮": "Left small flat wheel",
      "右小平轮": "Right small flat wheel",
      "左小平轮上的记号": "Mark on the left small flat wheel",
      "右小平轮上的记号": "Mark on the right small flat wheel",
      "左小平轮的吊绳（拉起、放下小平轮）": "Left small wheel's cord (lifts it up and lets it down)",
      "右小平轮的吊绳（拉起、放下小平轮）": "Right small wheel's cord (lifts it up and lets it down)",
      "大平轮": "Big flat wheel",
      "大平轮上的记号": "Mark on the big flat wheel",
      "车辕头上的左小轮": "Left roller at the end of the pole",
      "车辕头上的右小轮": "Right roller at the end of the pole",
    },
  },
};
