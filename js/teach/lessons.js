// The six lessons, as plain data (format: js/teach/types.js, rules:
// docs/lesson-format.md). Facts about the Song chariots follow
// research/REPORT.md and params/chariot.json; the Song text is in
// research/sources/songshi-149-zhinanche.txt.

/** @import { Lesson, Picture } from "./types.js" */

/** @type {Record<string, Picture>} */
const PICTURES = {
  sancai: {
    src: "images/lessons/sancai-tuhui.jpg",
    alt: "古书里的一幅画：一个木人站在底座上，伸手指着前方",
    credit: "明代王圻、王思义编《三才图会》（1609 年），公有领域，Wikimedia Commons",
  },
  museum: {
    src: "images/lessons/science-museum-model.jpg",
    alt: "一辆木头做的指南车模型，车顶站着伸手的木人。这个模型按差动式做的",
    credit: "伦敦科学博物馆的指南车模型（差动式）。摄影：Andy Dingley，CC BY 3.0，Wikimedia Commons",
  },
  gears: {
    src: "images/lessons/taiwan-museum-gears.jpg",
    alt: "指南车模型里面的一组齿轮，叠在一根竖轴旁边",
    credit: "台湾国立自然科学博物馆复原的指南车齿轮。摄影：SSR2000，CC BY-SA 3.0，Wikimedia Commons",
  },
};

/** @type {Lesson[]} */
export const LESSONS = [
  {
    id: "what",
    title: "指南车是什么",
    summary: "一辆车上的木人，总是指着南方。",
    steps: [
      {
        text: "这是<b>指南车</b>。\n\n车上站着一个木头小人。他伸着手，指着南方。",
        scene: { reset: true, mechanism: "differential", view: "follow", xray: false, explode: 0, demo: null, controls: [] },
      },
      {
        text: "看，车拐来拐去。\n\n木人的手指向哪里？仔细看一看。",
        scene: { reset: true, view: "follow", trails: true, play: "sCurve", controls: ["reset"] },
        task: {
          kind: "choose",
          prompt: "车拐弯以后，木人指着哪里？",
          options: ["跟着车头转", "还是指着南", "到处乱转"],
          answer: 1,
          right: "对！车怎么拐，他都指着南。",
          wrong: "再看一遍，盯住木人的手。",
        },
      },
      {
        text: "传说很久以前，黄帝打仗遇到大雾。士兵认不出方向，他就造了指南车。\n\n这只是传说。真正把造法写下来的，是一本讲宋朝历史的书，叫《宋史》。",
        picture: PICTURES.sancai,
      },
      {
        text: "指南车是指南针吗？\n\n<b>不是！</b>指南针里有一根磁针。是磁铁让它指南。\n\n指南车里<b>没有磁铁</b>，只有木头齿轮。",
        scene: { demo: "compass", view: "overview" },
        task: {
          kind: "choose",
          prompt: "指南车靠什么指南？",
          options: ["磁铁", "齿轮", "风"],
          answer: 1,
          right: "答对了！它是一台齿轮机器。",
          wrong: "它里面没有磁铁哦。再想想？",
        },
      },
      {
        text: "古书里还有一种「司南」。人们认为，它是用磁石做的小勺子。\n\n指南车又叫「司南车」。名字很像，可是完全不一样：司南靠磁石，指南车靠齿轮。",
        scene: { demo: null },
      },
      {
        text: "那它为什么能指南？\n\n秘密藏在车厢里。按一下「透视」，看看里面有什么。",
        scene: { view: "gears", controls: ["xray"] },
        task: { kind: "do", prompt: "按「透视」，看看车厢里面", check: "xrayOn", done: "看到了吧，里面全是齿轮！" },
      },
    ],
  },

  {
    id: "drive",
    title: "自己开一开",
    summary: "当一回车夫，看木人怎么指。",
    steps: [
      {
        text: "现在你来当<b>车夫</b>！车夫就是赶车的人。\n\n用方向按钮，让车往前走。",
        scene: { reset: true, mechanism: "differential", view: "follow", xray: false, explode: 0, demo: null, trails: true, controls: ["drive", "reset"] },
        task: { kind: "do", prompt: "往前开一段路", check: "drove", done: "开得真稳！" },
      },
      {
        text: "向左拐一个弯。\n\n一边拐，一边看木人的手。",
        task: { kind: "do", prompt: "开着车向左拐", check: "turnedLeft", done: "车头转了，木人还指着南！" },
      },
      {
        text: "再向右拐一个弯。",
        task: { kind: "do", prompt: "开着车向右拐", check: "turnedRight", done: "还是指着南，真厉害。" },
      },
      {
        text: "来个难的：让车掉头，往回开。",
        task: { kind: "do", prompt: "让车头转到后面去", check: "turnedAround", done: "车头掉过来了，木人还是指南。" },
      },
      {
        text: "在地上画一条弯弯曲曲的路。\n\n车会沿着你画的路走。",
        scene: { view: "top", controls: ["draw", "reset"] },
        task: { kind: "do", prompt: "画一条路，让车走一走", check: "drewRoute", done: "路再弯，木人也不迷路。" },
      },
      {
        text: "车头一直在变，木人却不变。\n\n他是怎么知道南在哪里的？下一节，我们先看看车轮。",
        scene: { controls: ["reset"] },
        task: {
          kind: "choose",
          prompt: "不管车怎么开，木人会怎样？",
          options: ["一直指着南", "一直指着车头", "一直指着车尾"],
          answer: 0,
          right: "对！这就是指南车的本领。",
          wrong: "回想一下刚才开车时，他指着哪边？",
        },
      },
    ],
  },

  {
    id: "wheels",
    title: "转弯时两个轮子",
    summary: "拐弯时，外边的轮子走得更多。",
    steps: [
      {
        text: "先不看车。\n\n两个小朋友手拉手，一起绕着圈走。一个在里圈，一个在外圈。",
        scene: { reset: true, mechanism: "differential", demo: "holdHands", view: "top", xray: false, explode: 0, highlight: [], controls: [] },
        task: { kind: "do", prompt: "让两个小朋友走一圈", check: "playedDemo", done: "走完一圈啦！" },
      },
      {
        text: "数一数他们的脚印。\n\n两人一起走完一圈。里圈小，外圈大。",
        task: {
          kind: "choose",
          prompt: "谁走的路更多？",
          options: ["里圈的人", "外圈的人", "一样多"],
          answer: 1,
          right: "对！外圈更大，要走更远。",
          wrong: "比一比两个圈，哪个更长？",
        },
      },
      {
        text: "车的两个轮子也一样。\n\n车直着走，<span class=\"l\">左轮</span>和<span class=\"r\">右轮</span>走的路一样长。",
        scene: { reset: true, demo: null, mechanism: "differential", view: "above", trails: true, odometer: true, play: "straight" },
      },
      {
        text: "现在车向左绕一个圈。\n\n<span class=\"l\">左轮</span>在里圈，<span class=\"r\">右轮</span>在外圈。看看两个轮子各走了多远。",
        scene: { reset: true, view: "top", play: "circle" },
        task: {
          kind: "choose",
          prompt: "哪个轮子走的路更多？",
          options: ["蓝色的左轮", "橙色的右轮", "一样多"],
          answer: 1,
          right: "对！右轮在外圈，走得多。",
          wrong: "想想手拉手的小朋友，谁在外圈？",
        },
      },
      {
        text: "车还能原地打转。\n\n这时<span class=\"l\">左轮</span>往后退，<span class=\"r\">右轮</span>往前走。两个轮子差得最多。",
        scene: { reset: true, play: "spinLeft" },
      },
      {
        text: "<b>记住：</b>车转得越多，两个轮子走的路就差得越多。\n\n反过来，只要知道两个轮子差了多少，就知道车转了多少。",
        scene: { reset: true, view: "follow", controls: ["drive", "reset"] },
        task: { kind: "do", prompt: "开车向右拐，看哪个轮子走得多", check: "turnedRight", done: "左轮在外边，这回左轮走得多！" },
      },
    ],
  },

  {
    id: "gears",
    title: "齿轮怎么「记账」",
    summary: "齿轮记下两个轮子的差，再让木人转回去。",
    steps: [
      {
        text: "车里的齿轮像一个记账的人。\n\n记账，就是把数一笔一笔记下来。齿轮记的是：每个车轮转了几圈。",
        scene: { reset: true, mechanism: "differential", demo: null, xray: true, explode: 0, view: "gears", odometer: false, highlight: ["wheelL", "wheelR", "crownL", "crownR"], controls: [] },
        picture: PICTURES.gears,
      },
      {
        text: "<span class=\"l\">左轮</span>带着一个齿轮转，<span class=\"r\">右轮</span>带着另一个齿轮转。\n\n车轮转一圈，它带的齿轮也转一圈。只是这两个齿轮转的方向正好相反。",
        scene: { highlight: ["sideA", "sideB"], play: "straight" },
      },
      {
        text: "两个齿轮中间，夹着几个小齿轮。小齿轮装在一个架子上，木人就站在这个架子上。\n\n车直着走，两个车轮转得一样多。两边一抵消，架子不动，木人也不动。",
        scene: { reset: true, view: "works", highlight: ["pinion", "carrier", "figure"], play: "straight" },
      },
      {
        text: "车拐弯时，外边的车轮转得多。\n\n多出来的圈数，就让架子带着木人<b>反着</b>转回去。",
        scene: { reset: true, view: "works", highlight: ["wheelR", "carrier", "figure"], play: "pivotLeft" },
        task: {
          kind: "choose",
          prompt: "车身向左转，木人在车上会怎么转？",
          options: ["也向左转", "向右转回去", "一动不动"],
          answer: 1,
          right: "对！它反着转，正好抵消车身的转动。",
          wrong: "如果木人跟着车转，就不指南了。再想想？",
        },
      },
      {
        text: "刚才车拐了两个弯，一共掉了个头。外边的车轮比里边<b>多转了一圈</b>。\n\n车身转了半圈，木人就反着转半圈，还是指着南。",
        scene: { reset: true, view: "top", trails: true, odometer: true, highlight: ["figure"], play: "pivotLeft" },
      },
      {
        text: "把「拆开」的滑块往右拖，齿轮会一个一个分开。",
        scene: { view: "gears", odometer: false, highlight: [], controls: ["explode", "xray"] },
        task: { kind: "do", prompt: "把滑块拖到右边，看看每个齿轮", check: "opened", done: "齿轮都分开了，看清楚了吗？" },
      },
      {
        text: "<b>车身转多少，木人就反着转多少。</b>\n\n所以站在地上看，木人好像一直没动，一直指着南。",
        scene: { explode: 0, view: "follow", controls: ["drive", "reset"] },
      },
    ],
  },

  {
    id: "two-ways",
    title: "古人的两种造法",
    summary: "《宋史》写的车和现代人猜的车。",
    steps: [
      {
        text: "刚才看到的齿轮，叫<b>差动式</b>。「差动」就是比一比两个轮子差了多少。\n\n可是，古人真是这样造的吗？其实我们<b>不完全知道</b>。",
        scene: { reset: true, mechanism: "differential", demo: null, xray: false, explode: 0, view: "overview", highlight: [], controls: [] },
        picture: PICTURES.museum,
      },
      {
        text: "《宋史》里记了两个人的造法。\n\n燕肃在 1027 年造了一辆。吴德仁在 1107 年又造了一辆。书里写了齿轮多大，有几个齿。",
      },
      {
        text: "我们来看燕肃的车。按「宋史式」，换一种齿轮。",
        scene: { xray: true, view: "gears", controls: ["mechanism"] },
        task: { kind: "do", prompt: "换成「宋史式」", check: "switchedToSong", done: "这就是燕肃的造法。" },
      },
      {
        text: "每个车轮旁边，立着一个齿轮，叫立子轮，有 24 个齿。\n\n两边各有一个小平轮，有 12 个齿。中间的大平轮有 48 个齿。它的竖轴通到车顶，木人就站在轴上。",
        scene: { reset: true, mechanism: "song", xray: true, view: "gears", highlight: ["footL", "footR", "smallL", "smallR", "bigFlat"] },
        task: {
          kind: "choose",
          prompt: "大平轮有几个齿？",
          options: ["12 个", "24 个", "48 个"],
          answer: 2,
          right: "对！《宋史》里写的就是 48 个齿。",
          wrong: "大平轮最大，齿也最多。再数数？",
        },
      },
      {
        text: "车直着走，两个小平轮都抬着，木人不动。\n\n一拐弯，车辕（车前面套牲口的长杆）一偏，外边的小平轮就落下去。外边的车轮就和大平轮连上了。",
        scene: { reset: true, assist: true, highlight: ["footR", "smallR", "bigFlat"], play: "pivotLeft" },
      },
      {
        text: "车轮转一圈，立子轮的 24 个齿都推过去。小平轮就转两圈，大平轮转半圈。\n\n拐一个直角弯，外边的车轮转半圈。大平轮转 12 个齿，就是四分之一圈。《宋史》里就是这么写的。",
        scene: { view: "top", highlight: ["bigFlat", "figure"] },
      },
      {
        text: "后来的人算了算，发现燕肃的车有个条件：拐弯时，里边的车轮要<b>停住</b>，车绕着它转。\n\n车夫得这样小心赶车，木人才指得准。这一回，「车夫帮忙」已经关掉了，车随便绕一个大圈。",
        scene: { reset: true, assist: false, view: "top", trails: true, highlight: [], play: "circle", controls: ["assist", "reset"] },
        task: {
          kind: "choose",
          prompt: "关掉「车夫帮忙」绕一圈，木人还指南吗？",
          options: ["还指着南", "指歪了"],
          answer: 1,
          right: "对，燕肃的车要靠车夫配合才准。把「车夫帮忙」打开，再按「再看一遍」，比一比。",
          wrong: "看看木人最后指着哪边？",
        },
      },
      {
        text: "吴德仁的车齿轮更多，大平轮有 100 个齿。\n\n可书里没写清这些齿轮是怎么一个接一个的。到今天，还没人能确定。",
        scene: { reset: true, assist: true, xray: true, view: "gears", highlight: ["bigFlat"], controls: [] },
      },
      {
        text: "那差动式是谁想出来的？是 20 世纪的英国工程师兰彻斯特。他按机械的道理猜出来的。\n\n古书里<b>没有</b>写差动式，可它怎么走都准。所以这个网页先用差动式，你也能换成宋史式比一比。",
        scene: { mechanism: "differential", assist: true, view: "top", highlight: [], controls: ["mechanism", "assist", "drive", "reset"] },
        task: {
          kind: "choose",
          prompt: "下面哪句话是对的？",
          options: ["《宋史》里写的是差动式", "差动式是现代人猜的", "古人的造法我们全都知道"],
          answer: 1,
          right: "对！宋史写的是燕肃的造法，差动式是后来人猜的。",
          wrong: "回头看看：古书里写的是哪一种？",
        },
      },
    ],
  },

  {
    id: "errors",
    title: "它会出错吗",
    summary: "轮子不对、地面打滑，木人都会指歪。",
    steps: [
      {
        text: "差动式的指南车，开多远都准吗？\n\n只要车造得刚刚好，就准。可要是哪里没做好呢？",
        scene: { reset: true, mechanism: "differential", demo: null, xray: false, explode: 0, highlight: [], faults: {}, slip: {}, view: "top", trails: true, controls: [] },
      },
      {
        text: "如果两个车轮装得太开了一点……\n\n齿轮是照原来的宽度做的，账就记错了。车只宽了一点点，绕一圈，木人却歪了好多。绕得越多，歪得越多。",
        scene: { reset: true, faults: { trackScale: 1.1 }, play: "circle" },
        task: {
          kind: "choose",
          prompt: "绕了好多圈以后，木人会怎样？",
          options: ["越来越歪", "自己变准", "一点不变"],
          answer: 0,
          right: "对，每一圈的错都会攒起来。",
          wrong: "每绕一圈都歪一点，加起来会怎样？",
        },
      },
      {
        text: "如果两个车轮一大一小……\n\n走同样远的路，大轮子转的圈数少，小轮子转的圈数多。齿轮以为车在拐弯，车明明直着走，木人却慢慢歪了。",
        scene: { reset: true, view: "above", faults: { leftWheelScale: 1.05 }, play: "straight" },
      },
      {
        text: "如果地很滑，一个车轮打滑空转……\n\n车轮转了好多圈，车却没走那么远。齿轮又被骗了。",
        scene: { reset: true, view: "above", faults: {}, slip: { slipR: 0.2 }, play: "straight" },
      },
      {
        text: "轮到你了：给车调一个毛病，把木人弄歪。",
        scene: { reset: true, slip: {}, faults: {}, view: "follow", controls: ["faults", "slip", "drive", "reset"] },
        task: { kind: "do", prompt: "调一个毛病，开车让木人指歪", check: "madeItDrift", done: "歪了吧！这就是机器会犯的错。" },
      },
      {
        text: "再把毛病改回来，让车重新变准。",
        task: { kind: "do", prompt: "把毛病改好", check: "fixedDrift", done: "修好了！你是个好工匠。" },
      },
      {
        text: "指南针不怕打滑。它靠磁针指南北，和车轮没关系。\n\n指南车没有磁铁。它只是一直在<b>数</b>车轮转了几圈。数错了，就指错了。",
        scene: { reset: true, demo: "compass", slip: { slipR: 0.2 }, play: "straight", view: "overview", controls: [] },
        task: {
          kind: "choose",
          prompt: "车轮打滑以后，谁还能指对南方？",
          options: ["指南车", "指南针"],
          answer: 1,
          right: "对！指南针靠磁铁，不怕打滑。",
          wrong: "打滑会骗过齿轮，可骗不过磁铁哦。",
        },
      },
      {
        text: "古书里还说，有一辆指南车是人躲在车里，偷偷转木人！\n\n真正的指南车不用偷偷转。它靠齿轮记账，是古人了不起的机器。",
        scene: { demo: null, slip: {}, faults: {}, reset: true, view: "overview", controls: [] },
      },
    ],
  },
];
