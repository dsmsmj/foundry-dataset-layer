/*
 * 构建分支解析练习（fallback 链）。规则依据官方文档 Branching 页：
 * https://www.palantir.com/docs/foundry/data-integration/branching
 *
 *   JobSpec：先找构建分支，没有就按 fallback 链找第一个发布了 JobSpec 的分支
 *   输入：  先读构建分支，没有就读 fallback 链里第一个存在的分支
 *   输出：  事务总是开在构建分支上；该分支不存在时，从 fallback 链的第一个分支创建，
 *          没有 fallback 时作为根分支创建
 *   构建不会在输入数据集上创建分支，也不会改构建分支以外的任何分支
 *
 * 练习对象：
 * { chain: ["feature", "develop", "master"],   // chain[0] 是构建分支，其余是 fallback
 *   datasets: [
 *     { name: "raw_orders", role: "input",  branches: ["master"] },
 *     { name: "clean_orders", role: "output", branches: ["develop", "master"], jobspec: ["master"] } ] }
 *
 * BranchSim.mountFallback(el, { exercises })
 */
(function () {
  const ROOT = "作为新的根分支创建";

  function firstIn(chain, have) { return chain.find((b) => have.includes(b)); }

  function questions(ex) {
    const [build, ...fallbacks] = ex.chain;
    const qs = [];
    ex.datasets.forEach((d) => {
      if (d.role === "input") {
        const ans = firstIn(ex.chain, d.branches);
        qs.push({
          text: `输入 <code>${d.name}</code> 读取哪个分支上的视图？`,
          options: ex.chain, answer: ans,
          why: ans === build
            ? `${d.name} 有 ${build} 分支，直接读构建分支。`
            : `${d.name} 没有 ${ex.chain.slice(0, ex.chain.indexOf(ans)).join("、")} 分支，沿 fallback 链找到第一个存在的分支 ${ans}。构建不会在输入上新建分支。`
        });
      } else {
        const js = firstIn(ex.chain, d.jobspec);
        qs.push({
          text: `输出 <code>${d.name}</code> 的 JobSpec 取自哪个分支？`,
          options: ex.chain, answer: js,
          why: js === build
            ? `构建分支 ${build} 上发布了 JobSpec，直接用。`
            : `${ex.chain.slice(0, ex.chain.indexOf(js)).join("、")} 上没有发布 JobSpec，沿 fallback 链找到 ${js}。`
        });
        qs.push({
          text: `输出 <code>${d.name}</code> 的新事务开在哪个分支上？`,
          options: ex.chain, answer: build,
          why: `输出的事务总是开在构建分支 ${build} 上，构建不会改其他分支。`
        });
        if (!d.branches.includes(build)) {
          const ans = fallbacks.length ? fallbacks[0] : ROOT;
          qs.push({
            text: `<code>${d.name}</code> 还没有 ${build} 分支。这个分支从哪里创建？`,
            options: fallbacks.concat([ROOT]), answer: ans,
            why: fallbacks.length
              ? `从 fallback 链的第一个分支 ${fallbacks[0]} 创建。`
              : "这次构建没有 fallback 链，所以作为根分支创建。"
          });
        }
      }
    });
    return qs;
  }

  // ---------- 随机题 ----------
  const rand = (n) => Math.floor(Math.random() * n);
  const coin = (p) => Math.random() < p;
  const INPUTS = ["raw_orders", "raw_customers", "raw_events", "ref_regions", "raw_payments"];
  const OUTPUTS = ["clean_orders", "order_summary", "customer_360", "daily_kpis"];

  function randomExercise() {
    const chain = coin(0.5) ? ["feature", "develop", "master"] : ["develop", "master"];
    const [build, first] = chain;
    const names = INPUTS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    const datasets = names.map((name) => {
      const branches = ["master"];
      chain.slice(0, -1).forEach((b) => { if (coin(0.4)) branches.push(b); });
      return { name, role: "input", branches };
    });
    const out = { name: OUTPUTS[rand(OUTPUTS.length)], role: "output", branches: ["master"], jobspec: ["master"] };
    chain.slice(0, -1).forEach((b) => {
      if (coin(0.45)) out.jobspec.push(b);
      if (coin(0.4)) out.branches.push(b);
    });
    // 构建分支不存在时，保证 fallback 链的第一个分支存在，贴合文档的描述
    if (!out.branches.includes(build) && !out.branches.includes(first)) out.branches.push(first);
    datasets.push(out);
    return { chain, datasets, random: true };
  }

  // ---------- 渲染 ----------
  function grid(ex) {
    const cols = ex.chain;
    const head = `<tr><th>数据集</th><th>角色</th>${cols.map((b, i) => `<th>${b}${i === 0 ? ' <span class="muted">（构建）</span>' : ""}</th>`).join("")}</tr>`;
    const rows = ex.datasets.map((d) => `<tr><td><code>${d.name}</code></td><td>${d.role === "input" ? "输入" : "输出"}</td>${cols.map((b) => {
      const has = d.branches.includes(b);
      const js = d.role === "output" && (d.jobspec || []).includes(b);
      return `<td>${has ? "● 有分支" : '<span class="muted">○ 无</span>'}${js ? '<br><span class="bs-js">JobSpec</span>' : ""}</td>`;
    }).join("")}</tr>`).join("");
    return `<div class="table-wrap"><table class="bs-grid">${head}${rows}</table></div>`;
  }

  function mountFallback(el, opts) {
    const fixed = opts.exercises || [];
    let idx = 0, total = 0, right = 0;
    el.classList.add("bsim");

    function current() { return fixed[idx] || (fixed[idx] = randomExercise()); }

    function render() {
      const ex = current();
      const fb = ex.chain.length > 1 ? ex.chain.slice(1).join(" → ") : "无";
      el.innerHTML = `
        <div class="bs-head"><span>第 ${idx + 1} 题${ex.random ? "（随机生成）" : ""}</span><span class="muted bs-score">${total ? `答对 ${right}/${total}` : ""}</span></div>
        <p>在 <b>${ex.chain[0]}</b> 分支上运行构建，fallback 链：<code>${ex.chain[0]} → ${fb}</code></p>
        ${grid(ex)}
        <ol class="bs-qs"></ol>
        <button type="button" class="btn bs-next">下一题</button>`;
      const list = el.querySelector(".bs-qs");
      questions(ex).forEach((q) => {
        const li = document.createElement("li");
        li.innerHTML = `<p>${q.text}</p><div class="bs-opts"></div><div class="feedback" aria-live="polite"></div>`;
        const box = li.querySelector(".bs-opts");
        q.options.forEach((o) => {
          const b = document.createElement("button");
          b.type = "button"; b.className = "chip"; b.textContent = o;
          b.addEventListener("click", () => {
            box.querySelectorAll("button").forEach((x) => (x.disabled = true));
            const ok = o === q.answer;
            total++; if (ok) right++;
            b.setAttribute("aria-pressed", "true");
            const f = li.querySelector(".feedback");
            f.className = "feedback " + (ok ? "ok" : "bad");
            f.textContent = (ok ? "对。" : `不对，答案是 ${q.answer}。`) + q.why;
            el.querySelector(".bs-score").textContent = `答对 ${right}/${total}`;
          });
          box.appendChild(b);
        });
        list.appendChild(li);
      });
      el.querySelector(".bs-next").addEventListener("click", () => { idx++; render(); });
    }
    render();
  }

  const css = `
  .bsim { border: 1px solid var(--rule); border-radius: 6px; padding: 1rem 1.1rem; margin: 1.4rem 0; }
  .bs-head { display: flex; justify-content: space-between; font-weight: 600; }
  .bs-grid td, .bs-grid th { font-size: 0.88rem; }
  .bs-js { font-family: var(--mono); font-size: 0.75rem; color: var(--update); }
  .bs-qs > li { margin-bottom: 0.9rem; }
  .bs-qs p { margin: 0.2rem 0; }
  .bs-opts .chip:disabled { cursor: default; }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  window.BranchSim = { questions, randomExercise, mountFallback };
})();
