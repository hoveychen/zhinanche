// Page copy outside the lessons: the home page hook, its shortcuts into the
// lessons, the hints on the 3D view and the words painted into the scene.
// Kept here, in one place, so a translation only has to replace this file
// (and lessons.js). The English table is strings.en.js, the same shape key for
// key (tests/i18n.test.js); js/i18n.js picks one.

import { CHI_IN_METERS } from "../sim/params.js";

const NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** One decimal, no "-0.0". @param {number} v */
export const fmt = (v) => {
  const r = Math.round(v * 10) / 10;
  return (Object.is(r, -0) ? 0 : r).toFixed(1);
};

export const STR = {
  /** the plaque on the gate far to the south */
  landmarkPlaque: "南",

  /** <html lang>, the tab title and the description */
  page: {
    htmlLang: "zh-CN",
    title: "指南车：开一开，拆一拆，看木人怎么指南",
    description: "中国古代指南车的 3D 仿真和六节小学课：自己开车、画路线、透视和拆开齿轮，看木人为什么一直指着南方。",
  },

  /** the top bar and the page frame (index.html) */
  bar: {
    brand: "指南车",
    tabsLabel: "页面",
    tabHome: "课程",
    tabFree: "自己开",
    stageLabel: "指南车",
    panelLabel: "课程",
    loading: "正在把车推出来……",
    loadFailed: "车没能搬出来，请刷新页面再试一次。",
    /** the language switch shows the other language */
    langButton: "EN",
    langLabel: "Switch to English",
  },

  home: {
    kicker: "一千年前的齿轮机器",
    title: "指南车",
    hook: "没有磁铁，只靠木头齿轮。车怎么转来转去，木人都指着南？",
    drive: "自己开一开",
    start: "从第一课看起",
    askHead: "大家常问",
    lessonsHead: "六节课",
  },

  /** questions on the home page that jump straight into a lesson step (1-based) */
  asks: [
    { q: "它会走偏吗？", a: "轮子做歪一点、地面一打滑，木人就慢慢指歪了。", lesson: 6, step: 2 },
    { q: "古人真的这么造吗？", a: "《宋史》写了一种造法，现代人又猜了一种。两种都能开。", lesson: 5, step: 1 },
  ],

  stage: {
    /** over the 3D view on the home page */
    hook: "车在拐弯，木人的手一直指着南门",
    dragHint: "拖一拖，换个角度看",
    drawHint: "用手指在地上画一条路，松手车就出发",
    sceneLabel: "指南车三维场景",
    /** @param {number} inner @param {number} outer */
    demoCount: (inner, outer) => `里圈走了 ${inner} 步，外圈走了 ${outer} 步`,
  },

  /** buttons on the page itself */
  ui: {
    pause: "暂停",
    resume: "继续",
    pauseKey: "空格键",
    paused: "停住了",
    pausedHow: "按「继续」或空格键接着走",
    moreBelow: "往下看",
    sheetOpen: "更多玩法：让它出错、透视、拆开",
    sheetClose: "收起",
  },

  free: {
    title: "自己开",
    howDrive: "按住方向按钮开车，或者用键盘的方向键。",
    howDraw: "按「画路线」，在地上画一条路，车会沿着它走。点一点齿轮，看看它叫什么。",
    breakHead: "让它出错试试",
    breakNote: "给车调一个毛病，再开一圈，看木人还指不指南门。",
  },

  /** the lesson player */
  course: {
    /** the badge in the lesson list, 0-based @param {number} i */
    numeral: (i) => NUM[i],
    /** @param {number} i 0-based */
    kicker: (i) => `第${NUM[i]}课`,
    /** @param {number} i 0-based */
    askGo: (i) => `第${NUM[i]}课 →`,
    /** @param {number} k 1-based @param {number} n */
    stepsLabel: (k, n) => `第 ${k} 步，共 ${n} 步`,
    replay: "再看一遍",
    walk: "让他们走一圈",
    navLabel: "翻页",
    back: "上一步",
    next: "下一步",
    nextLesson: "下一课",
    toc: "回到目录",
  },

  /** the drive pad and the draw button on the 3D view */
  drive: {
    up: "前进",
    down: "后退",
    left: "左拐",
    right: "右拐",
    padLabel: "开车：按住方向按钮，也可以用键盘方向键",
    draw: "画路线",
  },

  /** the south dial and the wheel distances */
  hud: {
    north: "北",
    east: "东",
    west: "西",
    south: "南",
    onSouth: "木人指着正南",
    /** @param {number} deg */
    offSouth: (deg) => `木人偏离正南 ${deg}°`,
    /** the big number, from chi @param {number} chi */
    num: (chi) => fmt(chi),
    unit: "尺",
    /** the small line under it @param {number} chi */
    sub: (chi) => `约 ${fmt(chi * CHI_IN_METERS)} 米`,
    wheelL: "左轮",
    wheelR: "右轮",
    odoLabel: "两个车轮各走了多远（点一下收起或展开）",
    same: "两个轮子走得一样多",
    opposite: "两个轮子朝相反方向走",
    /** @param {number} chi */
    rightMore: (chi) => `右轮比左轮多走 ${fmt(chi)} 尺`,
    /** @param {number} chi */
    leftMore: (chi) => `左轮比右轮多走 ${fmt(chi)} 尺`,
  },

  /** the controls a lesson step can show (js/app/tools.js) */
  tools: {
    label: "工具",
    mechanism: "造法",
    differential: "差动式",
    differentialHint: "现代人猜的造法",
    song: "宋史式",
    songHint: "《宋史》里燕肃的造法",
    assistBlock: "宋史式开法",
    assist: "车夫帮忙",
    assistOff: "换成宋史式才用得上。",
    assistOn: "拐弯时，车夫让里边的车轮停住，车绕着它转。",
    assistNone: "车夫不管了，车随便拐弯。",
    faults: "毛病",
    faultsBlock: "车造得准不准",
    faultNone: "造得刚好",
    faultTrack: "轮距太宽",
    faultTrackHint: "两个车轮装得太开了一点",
    faultWheel: "左轮大一点",
    faultWheelHint: "两个车轮一大一小",
    ground: "地面",
    noSlip: "不打滑",
    slipR: "右轮打滑",
    xrayBlock: "看里面",
    xray: "透视",
    explodeBlock: "拆开看齿轮",
    explode: "拆开多少",
    together: "合上",
    apart: "拆开",
    speed: "快慢",
    slow: "慢",
    normal: "中",
    fast: "快",
    resetBlock: "重新开始",
    reset: "回到起点",
  },

  /** words painted into the 3D scene */
  scene: {
    north: "北",
    east: "东",
    west: "西",
    south: "南",
    /** a small line under the plaque's character, "" for none */
    plaqueSub: "",
    compass: "指南针：靠磁针",
    inner: "里圈",
    outer: "外圈",
  },

  /** the "what is this gear" callout */
  parts: {
    /** @param {number} n */
    teeth: (n) => `${n} 个齿`,
    /** @param {number} n */
    pegs: (n) => `；中间一圈 ${n} 根木销，咬着小齿轮`,
    /**
     * Display names by the GLB's own (Chinese) label; a label missing here is
     * shown as it is in the GLB.
     * @type {Record<string, string>}
     */
    names: {},
  },
};

/** @typedef {typeof STR} Strings */
