# Lesson format

Lessons live in `js/teach/lessons.js` as plain data: `export const LESSONS = [...]`. The types are in `js/teach/types.js`. The lesson player in `js/app/` reads each step and does three things:

1. It applies `scene` to the 3D view: mechanism, camera, x-ray, explode, highlights, trails, odometer, faults, auto-play route, mini demo, and which controls are visible.
2. It shows `text` and, if the step has one, `picture` in the lesson panel.
3. If the step has a `task`, it shows the task. The "next" button is always available, so a child who gets stuck can move on. A passed task gives a cheerful tick.

## Writing rules

These rules come from the brief and apply to every lesson.

- The reader is 9–12 years old. Keep sentences short, at most about 25 characters where possible, and keep each step to 1–3 short paragraphs.
- Use no formulas and no symbols like π, θ or ratios with colons. To talk about proportions, use concrete counts: 「车轮转一圈，小齿轮转两圈」 or 「大齿轮有 48 个齿」.
- Start from everyday experience, such as two children holding hands and walking round a circle, before showing gears.
- Say clearly that the chariot is a machine and has no magnet. It is not 司南 or 指南针.
- Be honest about what we do not know: 「古人到底怎么造的，我们没法完全确定」. Mark what comes from the old book (《宋史》) and what modern people guessed.
- Text is original. Pictures must come from `images/` with a REUSE licence entry.
- Wheel colours are consistent everywhere: the left wheel is blue (`<span class="l">`) and the right wheel is orange (`<span class="r">`).

## Lesson plan (agreed with the boss)

1. 指南车是什么
2. 自己开一开
3. 转弯时两个轮子
4. 齿轮怎么「记账」
5. 古人的两种造法
6. 它会出错吗
