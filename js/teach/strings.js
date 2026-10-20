// Page copy outside the lessons: the home page hook, its shortcuts into the
// lessons, the hints on the 3D view and the words painted into the scene.
// Kept here, in one place, so a translation only has to replace this file
// (and lessons.js).

export const STR = {
  /** the plaque on the gate far to the south */
  landmarkPlaque: "南",

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
  },

  /** buttons on the page itself */
  ui: {
    pause: "暂停",
    resume: "继续",
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
    /** the button on the 3D view that goes close on the gears, and back */
    gearsOn: "看齿轮",
    gearsOff: "回到车后",
  },
};
