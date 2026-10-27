/*
 * 增量 transform 运行方式练习。规则依据官方文档 Python incremental usage 页：
 * https://www.palantir.com/docs/foundry/transforms-python/incremental-usage
 *
 *   输出从没构建过、或 semantic_version 变了 → 快照运行（require_incremental 也允许）
 *   非 snapshot 输入出现 SNAPSHOT、覆盖已有文件的 UPDATE、不被允许的 DELETE → 退回快照
 *     （require_incremental=True 时改为构建失败）
 *   输入只有追加（APPEND、只加文件的 UPDATE）→ 增量：added 只读新增的行，输出 modify 追加
 *   输入没有任何新事务、代码也没变 → 新鲜，构建跳过（第 3 课）
 *
 * 输入事务类型：
 *   APPEND | UPDATE_ADD | UPDATE_OVERWRITE | SNAPSHOT | DELETE_RETENTION | DELETE_USER
 * 场景：
 * { inputs: [{ name, txs: [...], snapshotInput?: true }],
 *   allowRetention?, requireIncremental?, semverChanged?, firstBuild? }
 *
 * IncrSim.decide(scenario) -> { mode: "incremental"|"snapshot"|"fail"|"fresh", why }
 * IncrSim.mountIncremental(el, { scenarios })
 */
(function () {
  const TX_TEXT = {
    APPEND: "APPEND（追加新文件）",
    UPDATE_ADD: "UPDATE（只加新文件）",
    UPDATE_OVERWRITE: "UPDATE（覆盖了已有文件）",
    SNAPSHOT: "SNAPSHOT（整体替换）",
    DELETE_RETENTION: "DELETE（保留策略删除旧文件）",
    DELETE_USER: "DELETE（用户手动删除文件）"
  };
  const TX_CLASS = { APPEND: "APPEND", UPDATE_ADD: "UPDATE", UPDATE_OVERWRITE: "UPDATE", SNAPSHOT: "SNAPSHOT", DELETE_RETENTION: "DELETE", DELETE_USER: "DELETE" };

  const OPTIONS = {
    incremental: "增量：只读新增，追加到输出",
    snapshot: "快照：读全量，整体替换输出",
    fail: "构建失败：不会自动退回快照",
    fresh: "新鲜跳过：这次构建不运行它"
  };

  function breaker(s, inp, tx) {
    if (inp.snapshotInput) return null;
    if (tx === "SNAPSHOT") return `${inp.name} 有一条 SNAPSHOT，旧数据被整体换掉`;
    if (tx === "UPDATE_OVERWRITE") return `${inp.name} 有一条覆盖已有文件的 UPDATE，旧数据被改了`;
    if (tx === "DELETE_USER") return `${inp.name} 有一条用户删除文件的 DELETE`;
    if (tx === "DELETE_RETENTION" && !s.allowRetention) return `${inp.name} 有保留策略删除的文件，但没有设 allow_retention=True`;
    return null;
  }

  function decide(s) {
    if (s.firstBuild) return { mode: "snapshot", why: "输出从没构建过，第一次只能快照运行（require_incremental 也允许）。" };
    if (s.semverChanged) return { mode: "snapshot", why: "semantic_version 改了，强制下一次非增量运行（require_incremental 也允许）。" };
    const anyNew = s.inputs.some((i) => i.txs.length);
    if (!anyNew) return { mode: "fresh", why: "输入没有新事务，代码也没变，输出是新鲜的，构建直接跳过它（第 3 课）。" };
    const reasons = [];
    s.inputs.forEach((i) => i.txs.forEach((t) => { const r = breaker(s, i, t); if (r) reasons.push(r); }));
    if (reasons.length) {
      if (s.requireIncremental) return { mode: "fail", why: reasons.join("；") + "。本来要退回快照，但设了 require_incremental=True，所以构建失败。" };
      return { mode: "snapshot", why: reasons.join("；") + "。没法只看新增部分，自动退回快照：added 读到全量，输出整体替换。" };
    }
    const notes = [];
    s.inputs.forEach((i) => {
      if (i.snapshotInput && i.txs.length) notes.push(`${i.name} 被声明为 snapshot_inputs，它被整体重写不影响增量`);
      if (i.txs.includes("DELETE_RETENTION")) notes.push(`${i.name} 的保留策略删除被 allow_retention=True 允许`);
    });
    return { mode: "incremental", why: (notes.length ? notes.join("；") + "。" : "") + "输入只有追加，可以增量运行：added 只读上次运行后新增的行，输出以 modify 方式追加。" };
  }

  // ---------- 随机题 ----------
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
  const coin = (p) => Math.random() < p;
  function randomScenario() {
    const s = { inputs: [], random: true };
    const pool = ["APPEND", "APPEND", "APPEND", "UPDATE_ADD", "UPDATE_OVERWRITE", "SNAPSHOT", "DELETE_RETENTION", "DELETE_USER"];
    const names = coin(0.5) ? ["events"] : ["events", "regions"];
    names.forEach((name) => {
      const n = coin(0.12) ? 0 : 1 + Math.floor(Math.random() * 2);
      const txs = Array.from({ length: n }, () => pick(pool));
      const inp = { name, txs };
      if (name === "regions" && coin(0.4)) inp.snapshotInput = true;
      s.inputs.push(inp);
    });
    if (coin(0.35)) s.allowRetention = true;
    if (coin(0.3)) s.requireIncremental = true;
    if (coin(0.08)) s.semverChanged = true;
    return s;
  }

  function describe(s) {
    const flags = [];
    if (s.allowRetention) flags.push("allow_retention=True");
    if (s.requireIncremental) flags.push("require_incremental=True");
    if (s.semverChanged) flags.push("semantic_version 刚从 1 改成 2");
    if (s.firstBuild) flags.push("输出还从没构建过");
    const rows = s.inputs.map((i) => `<tr><td><code>${i.name}</code>${i.snapshotInput ? '<br><span class="muted">snapshot_inputs</span>' : ""}</td><td>${
      i.txs.length ? i.txs.map((t) => `<span class="tx ${TX_CLASS[t]}">${TX_CLASS[t]}</span> ${TX_TEXT[t].replace(/^[A-Z]+/, "")}`).join("<br>") : '<span class="muted">没有新事务</span>'
    }</td></tr>`).join("");
    return `<p>增量 transform 的设置：${flags.length ? flags.map((f) => `<code>${f}</code>`).join("，") : "默认（无额外参数）"}</p>
      <div class="table-wrap"><table><thead><tr><th>输入</th><th>上次运行之后的新事务</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function mountIncremental(el, opts) {
    const fixed = opts.scenarios || [];
    let idx = 0, tried = 0, right = 0;
    el.classList.add("insim");
    const current = () => fixed[idx] || (fixed[idx] = randomScenario());

    function render() {
      const s = current();
      el.innerHTML = `
        <div class="in-head"><span>第 ${idx + 1} 题${s.random ? "（随机生成）" : ""}</span><span class="muted in-score">${tried ? `答对 ${right}/${tried}` : ""}</span></div>
        ${describe(s)}
        <p><b>这次构建，这个 transform 会怎么跑？</b></p>
        <div class="in-opts"></div>
        <div class="feedback" aria-live="polite"></div>
        <button type="button" class="btn in-next">下一题</button>`;
      const box = el.querySelector(".in-opts");
      const d = decide(s);
      Object.entries(OPTIONS).forEach(([k, text]) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn in-opt"; b.textContent = text;
        b.addEventListener("click", () => {
          box.querySelectorAll("button").forEach((x) => (x.disabled = true));
          const ok = k === d.mode;
          tried++; if (ok) right++;
          b.classList.add(ok ? "chosen-ok" : "chosen-bad");
          box.querySelector(`[data-k="${d.mode}"]`).classList.add("is-answer");
          const f = el.querySelector(".feedback");
          f.className = "feedback " + (ok ? "ok" : "bad");
          f.textContent = (ok ? "对。" : `不对，答案是"${OPTIONS[d.mode]}"。`) + d.why;
          el.querySelector(".in-score").textContent = `答对 ${right}/${tried}`;
        });
        b.dataset.k = k;
        box.appendChild(b);
      });
      el.querySelector(".in-next").addEventListener("click", () => { idx++; render(); });
    }
    render();
  }

  const css = `
  .insim { border: 1px solid var(--rule); border-radius: 6px; padding: 1rem 1.1rem; margin: 1.4rem 0; }
  .in-head { display: flex; justify-content: space-between; font-weight: 600; }
  .in-opts { display: grid; gap: 0.4rem; margin-bottom: 0.4rem; }
  .in-opt { text-align: left; border-color: var(--rule); }
  .in-opt:disabled { opacity: 1; cursor: default; }
  .in-opt.is-answer { border-color: var(--ok); color: var(--ok); }
  .in-opt.chosen-bad { border-color: var(--bad); color: var(--bad); text-decoration: line-through; }
  .in-next { margin-top: 0.8rem; }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  window.IncrSim = { decide, randomScenario, mountIncremental };
})();
