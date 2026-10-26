/*
 * 构建新鲜度（staleness）练习。规则依据官方文档 Builds 页：
 * https://www.palantir.com/docs/foundry/data-integration/builds
 *
 *   输出的输入数据集和 JobSpec 逻辑自上次构建以来都没变 → 新鲜（fresh），不重算
 *   force build → 不管新不新鲜，全部重算
 * 推论：上游被重算会产出新事务，于是下游的输入也变了，下游同样要重算。
 *
 * pipeline：{ nodes: [{ id, x, y, raw?: true, inputs?: [id] }] }
 *   raw 节点是已经同步进来的原始数据集，本次构建不重算它们
 * scenario：{ tx: [rawId], code: [id], force?: bool }
 *   tx   = 自上次构建以来有了新事务的原始数据集
 *   code = 自上次构建以来 JobSpec（转换逻辑）变了的数据集
 *
 * BuildSim.recompute(pipeline, scenario) -> 会被重算的数据集 id 数组
 * BuildSim.mountStaleness(el, { pipeline, scenarios })
 */
(function () {
  function recompute(p, s) {
    const changed = new Set(s.tx || []);
    const out = [];
    // nodes 按拓扑顺序给出
    p.nodes.forEach((n) => {
      if (n.raw) return;
      const stale = s.force || (s.code || []).includes(n.id) || n.inputs.some((i) => changed.has(i));
      if (stale) { changed.add(n.id); out.push(n.id); }
    });
    return out;
  }

  function why(p, s, id) {
    const n = p.nodes.find((x) => x.id === id);
    const re = new Set(recompute(p, s));
    if (s.force) return "force build 不看新鲜度，全部重算。";
    const reasons = [];
    if ((s.code || []).includes(id)) reasons.push("它自己的 JobSpec 变了");
    n.inputs.forEach((i) => {
      if ((s.tx || []).includes(i)) reasons.push(`输入 ${i} 有新事务`);
      else if (re.has(i)) reasons.push(`输入 ${i} 被重算，产出了新事务`);
    });
    return reasons.length ? reasons.join("；") : "输入和 JobSpec 都没变，是新鲜的";
  }

  function describe(s) {
    const parts = [];
    (s.tx || []).forEach((r) => parts.push(`<code>${r}</code> 同步进来一条新事务`));
    (s.code || []).forEach((c) => parts.push(`<code>${c}</code> 的转换代码改了并已发布（JobSpec 变了）`));
    if (!parts.length) parts.push("自上次构建以来，什么都没变");
    return parts.join("；") + "。" + (s.force ? " 这次用的是 <b>force build</b>。" : "");
  }

  const rand = (n) => Math.floor(Math.random() * n);
  function randomScenario(p) {
    const raws = p.nodes.filter((n) => n.raw).map((n) => n.id);
    const derived = p.nodes.filter((n) => !n.raw).map((n) => n.id);
    const s = { tx: [], code: [] };
    raws.forEach((r) => { if (Math.random() < 0.35) s.tx.push(r); });
    if (Math.random() < 0.5) s.code.push(derived[rand(derived.length)]);
    if (!s.tx.length && !s.code.length && Math.random() < 0.5) s.force = true;
    s.random = true;
    return s;
  }

  function svg(p) {
    const W = 150, H = 34;
    const pos = Object.fromEntries(p.nodes.map((n) => [n.id, n]));
    const maxX = Math.max(...p.nodes.map((n) => n.x)) + W + 10;
    const maxY = Math.max(...p.nodes.map((n) => n.y)) + H + 10;
    const edges = p.nodes.flatMap((n) => (n.inputs || []).map((i) => {
      const a = pos[i];
      const x1 = a.x + W, y1 = a.y + H / 2, x2 = n.x, y2 = n.y + H / 2, mx = (x1 + x2) / 2;
      return `<path class="bd-edge" d="M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 4} ${y2}" marker-end="url(#bd-arrow)"/>`;
    })).join("");
    const nodes = p.nodes.map((n) => `
      <g class="bd-node${n.raw ? " raw" : ""}" data-id="${n.id}" ${n.raw ? "" : 'role="button" tabindex="0" aria-pressed="false"'}>
        <rect x="${n.x}" y="${n.y}" width="${W}" height="${H}" rx="5"/>
        <text x="${n.x + W / 2}" y="${n.y + H / 2 + 4}" text-anchor="middle">${n.id}</text>
      </g>`).join("");
    return `<svg class="bd-svg" viewBox="0 0 ${maxX} ${maxY}" role="group" aria-label="管道依赖图，点击数据集选择">
      <defs><marker id="bd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="bd-arrowhead"/></marker></defs>
      ${edges}${nodes}</svg>`;
  }

  function mountStaleness(el, opts) {
    const p = opts.pipeline;
    const fixed = opts.scenarios || [];
    let idx = 0, tried = 0, solved = 0;
    el.classList.add("bdsim");

    function current() { return fixed[idx] || (fixed[idx] = randomScenario(p)); }

    function render() {
      const s = current();
      el.innerHTML = `
        <div class="bd-head"><span>第 ${idx + 1} 题${s.random ? "（随机生成）" : ""}</span><span class="muted bd-score">${tried ? `一次答对 ${solved}/${tried}` : ""}</span></div>
        <p>上次构建之后：${describe(s)}</p>
        <p>现在对整条管道发起一次构建。<b>哪些数据集会被重算？</b>点选它们（灰色的原始数据集本次不构建），一个都不重算就直接点"检查"。</p>
        ${svg(p)}
        <div class="bd-actions"><button type="button" class="btn primary bd-check">检查</button><button type="button" class="btn bd-next">下一题</button></div>
        <div class="feedback" aria-live="polite"></div>
        <ul class="bd-why"></ul>`;
      s.attempts = 0;
      el.querySelectorAll(".bd-node:not(.raw)").forEach((g) => {
        const toggle = () => g.setAttribute("aria-pressed", g.getAttribute("aria-pressed") === "true" ? "false" : "true");
        g.addEventListener("click", toggle);
        g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      });
      el.querySelector(".bd-check").addEventListener("click", check);
      el.querySelector(".bd-next").addEventListener("click", () => { idx++; render(); });
    }

    function check() {
      const s = current();
      const want = recompute(p, s).sort();
      const got = Array.from(el.querySelectorAll('.bd-node[aria-pressed="true"]')).map((g) => g.dataset.id).sort();
      const ok = want.length === got.length && want.every((x, i) => x === got[i]);
      s.attempts++;
      if (s.attempts === 1) { tried++; if (ok) solved++; }
      el.querySelector(".bd-score").textContent = `一次答对 ${solved}/${tried}`;
      const fb = el.querySelector(".feedback");
      const done = ok || s.attempts >= 2;
      if (ok) { fb.className = "feedback ok"; fb.textContent = `对。会重算：${want.join("、") || "无"}。`; }
      else if (!done) { fb.className = "feedback bad"; fb.innerHTML = "还不对。提示：从发生变化的地方出发，<b>顺着箭头往下游</b>推：一个数据集被重算，就会给下游带去新事务。再试一次。"; }
      else { fb.className = "feedback bad"; fb.textContent = `答案是：${want.join("、") || "一个都不重算"}。下面是每个数据集的理由。`; }
      if (done) {
        el.querySelector(".bd-check").disabled = true;
        el.querySelectorAll(".bd-node:not(.raw)").forEach((g) => g.classList.toggle("stale", want.includes(g.dataset.id)));
        el.querySelector(".bd-why").innerHTML = p.nodes.filter((n) => !n.raw)
          .map((n) => `<li><code>${n.id}</code>：${want.includes(n.id) ? "重算" : "跳过"}。${why(p, s, n.id)}</li>`).join("");
      }
    }
    render();
  }

  const css = `
  .bdsim { border: 1px solid var(--rule); border-radius: 6px; padding: 1rem 1.1rem; margin: 1.4rem 0; }
  .bd-head { display: flex; justify-content: space-between; font-weight: 600; }
  .bd-svg { width: 100%; height: auto; display: block; margin: 0.6rem 0; }
  .bd-edge { fill: none; stroke: var(--muted); stroke-width: 1.5; }
  .bd-arrowhead { fill: var(--muted); }
  .bd-node rect { fill: var(--chip-bg); stroke: var(--rule); stroke-width: 1.5; }
  .bd-node text { font-family: var(--mono); font-size: 13px; fill: var(--fg); pointer-events: none; }
  .bd-node:not(.raw) { cursor: pointer; }
  .bd-node.raw rect { fill: none; stroke-dasharray: 4 3; }
  .bd-node.raw text { fill: var(--muted); }
  .bd-node[aria-pressed="true"] rect { fill: var(--chip-on); stroke: var(--chip-on); }
  .bd-node[aria-pressed="true"] text { fill: var(--chip-on-fg); }
  .bd-node.stale rect { stroke: var(--accent); stroke-width: 3; }
  .bd-node:focus-visible rect { stroke: var(--accent); stroke-width: 3; }
  .bd-actions { display: flex; gap: 0.5rem; }
  .bd-why { font-size: 0.92rem; }
  .bd-why:empty { display: none; }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  window.BuildSim = { recompute, randomScenario, mountStaleness };
})();
