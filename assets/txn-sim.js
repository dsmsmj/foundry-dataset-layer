/*
 * 事务 → 视图 模拟器。规则依据官方文档 Datasets 页：
 * https://www.palantir.com/docs/foundry/data-integration/datasets
 *
 * 事务对象：{ type: "SNAPSHOT"|"APPEND"|"UPDATE"|"DELETE", files: ["A", ...], aborted?: true }
 *   SNAPSHOT  用 files 整体替换视图
 *   APPEND    加入新文件（不能是视图里已有的文件）
 *   UPDATE    加入新文件；若文件已在视图里，则覆盖内容（A → A'）
 *   DELETE    从视图移除文件（后端文件并未物理删除）
 *   aborted   事务被 ABORTED，期间写入的文件被忽略
 *
 * TxnSim.replay(history)          -> 每一步之后的视图（数组，元素是文件标签数组）
 * TxnSim.mountPredict(el, opts)   -> 挂载"预测视图"练习
 */
(function () {
  const PRIME = "'";

  function describe(tx, labelsBefore) {
    const set = (xs) => "{" + xs.join(", ") + "}";
    switch (tx.type) {
      case "SNAPSHOT": return `写入 ${set(tx.files)}，替换整个视图`;
      case "APPEND": return `加入 ${tx.files.join(", ")}`;
      case "UPDATE": return tx.files.map((f) => {
        const cur = labelsBefore.find((l) => l.replace(/'+$/, "") === f);
        return cur ? `覆盖 ${cur} → ${cur + PRIME}` : `加入 ${f}`;
      }).join("；");
      case "DELETE": return `移除 ${tx.files.join(", ")}`;
    }
  }

  // 视图状态：Map<文件名, 版本号>；版本 0 显示为 A，1 为 A'，以此类推
  const label = (name, v) => name + PRIME.repeat(v);
  const labels = (state) => Array.from(state.entries()).map(([n, v]) => label(n, v)).sort();

  function apply(state, tx, versions) {
    if (tx.aborted) return state;
    const next = new Map(state);
    if (tx.type === "SNAPSHOT") {
      next.clear();
      tx.files.forEach((f) => { versions.set(f, (versions.get(f) ?? -1) + 1); next.set(f, versions.get(f)); });
    } else if (tx.type === "APPEND") {
      tx.files.forEach((f) => { versions.set(f, (versions.get(f) ?? -1) + 1); next.set(f, versions.get(f)); });
    } else if (tx.type === "UPDATE") {
      tx.files.forEach((f) => { versions.set(f, (versions.get(f) ?? -1) + 1); next.set(f, versions.get(f)); });
    } else if (tx.type === "DELETE") {
      tx.files.forEach((f) => next.delete(f));
    }
    return next;
  }

  function replay(history) {
    let state = new Map();
    const versions = new Map();
    const steps = [];
    history.forEach((tx) => {
      const before = labels(state);
      state = apply(state, tx, versions);
      steps.push({ tx, before, after: labels(state), text: describe(tx, before) });
    });
    return steps;
  }

  // 视图从"该时间点之前最近的已提交 SNAPSHOT"开始
  function startIndex(history, upto) {
    for (let i = upto; i >= 0; i--) if (history[i].type === "SNAPSHOT" && !history[i].aborted) return i;
    return 0;
  }

  // 干扰项：曾出现过的所有标签 + 被 ABORTED 的事务想写入的文件 + 视图里文件的下一个版本
  function candidates(history, steps, upto) {
    const all = new Set();
    steps.forEach((s) => { s.before.forEach((l) => all.add(l)); s.after.forEach((l) => all.add(l)); });
    history.forEach((tx, i) => {
      if (!tx.aborted) return;
      tx.files.forEach((f) => {
        const cur = steps[i].before.find((l) => l.replace(/'+$/, "") === f);
        all.add(cur && tx.type === "UPDATE" ? cur + PRIME : f);
      });
    });
    return Array.from(all).sort((a, b) => a.localeCompare(b));
  }

  // ---------- 随机题 ----------
  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(xs) { return xs[rand(xs.length)]; }

  function randomHistory() {
    const letters = "ABCDEFGHJK".split("");
    let used = 0;
    const fresh = () => letters[used++];
    const h = [];
    const first = [fresh(), fresh()];
    if (Math.random() < 0.5) first.push(fresh());
    h.push({ type: "SNAPSHOT", files: first });
    let snapshots = 1;
    const len = 4 + rand(3);
    while (h.length < len) {
      const view = replay(h).at(-1).after.map((l) => l.replace(/'+$/, ""));
      const r = Math.random();
      if (r < 0.22) h.push({ type: "APPEND", files: [fresh()] });
      else if (r < 0.44 && view.length) h.push({ type: "UPDATE", files: [pick(view)] });
      else if (r < 0.6 && view.length > 1) h.push({ type: "DELETE", files: [pick(view)] });
      else if (r < 0.74) {
        const kind = pick(["APPEND", "UPDATE", "DELETE"]);
        if (kind === "APPEND") h.push({ type: "APPEND", files: [fresh()], aborted: true });
        else if (view.length) h.push({ type: kind, files: [pick(view)], aborted: true });
      } else if (r < 0.86 && snapshots < 2 && h.length >= 2) {
        h.push({ type: "SNAPSHOT", files: Math.random() < 0.5 ? [fresh()] : [pick(view) || fresh(), fresh()] });
        snapshots++;
      } else if (view.length) h.push({ type: "UPDATE", files: [fresh()] });
    }
    // 问"最后一步之后"或"中间某一步之后"
    const upto = Math.random() < 0.6 ? h.length - 1 : 2 + rand(h.length - 2);
    return { history: h, upto };
  }

  // ---------- 练习挂载 ----------
  function mountPredict(el, opts) {
    const fixed = opts.exercises || [];
    let idx = 0;
    let solved = 0, tried = 0;

    el.classList.add("txsim");
    el.innerHTML = `
      <div class="txsim-head"><span class="txsim-title"></span><span class="txsim-score muted"></span></div>
      <div class="table-wrap"><table class="txsim-hist"><thead><tr><th>#</th><th>事务</th><th>内容</th></tr></thead><tbody></tbody></table></div>
      <p class="txsim-q"></p>
      <div class="txsim-chips" role="group" aria-label="候选文件"></div>
      <div class="txsim-actions">
        <button type="button" class="btn primary txsim-check">检查</button>
        <button type="button" class="btn txsim-next">下一题</button>
      </div>
      <div class="feedback" aria-live="polite"></div>
      <ol class="txsim-replay"></ol>`;
    const $ = (s) => el.querySelector(s);

    function current() {
      return idx < fixed.length ? fixed[idx] : (fixed[idx] = Object.assign(randomHistory(), { random: true }));
    }

    function render() {
      const ex = current();
      const steps = replay(ex.history);
      $(".txsim-title").textContent = ex.random ? `第 ${idx + 1} 题（随机生成）` : `第 ${idx + 1} 题`;
      $(".txsim-score").textContent = tried ? `一次答对 ${solved}/${tried}` : "";
      $("tbody").innerHTML = ex.history.map((tx, i) => `
        <tr class="${i > ex.upto ? "after" : ""}">
          <td>${i + 1}</td>
          <td><span class="tx ${tx.aborted ? "ABORTED" : tx.type}">${tx.type}</span>${tx.aborted ? ' <span class="muted">ABORTED</span>' : ""}</td>
          <td>${steps[i].text}</td>
        </tr>`).join("");
      $(".txsim-q").innerHTML = `第 <b>${ex.upto + 1}</b> 步之后，这个数据集的 <b>视图</b> 包含哪些文件？点选全部答案。`;
      const chips = $(".txsim-chips");
      chips.innerHTML = "";
      candidates(ex.history, steps, ex.upto).forEach((l) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip"; b.textContent = l;
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true"));
        chips.appendChild(b);
      });
      $(".feedback").className = "feedback"; $(".feedback").innerHTML = "";
      $(".txsim-replay").innerHTML = "";
      $(".txsim-check").disabled = false;
      ex.attempts = 0;
    }

    $(".txsim-check").addEventListener("click", () => {
      const ex = current();
      const steps = replay(ex.history);
      const want = steps[ex.upto].after;
      const got = Array.from(el.querySelectorAll(".chip[aria-pressed=true]")).map((b) => b.textContent).sort();
      const ok = want.length === got.length && want.every((x, i) => x === got[i]);
      ex.attempts++;
      if (ex.attempts === 1) { tried++; if (ok) solved++; }
      const fb = $(".feedback");
      const s = startIndex(ex.history, ex.upto);
      if (ok) {
        fb.className = "feedback ok";
        fb.innerHTML = `对，视图是 {${want.join(", ") || "空"}}。`;
        $(".txsim-check").disabled = true;
      } else {
        fb.className = "feedback bad";
        fb.innerHTML = ex.attempts < 2
          ? `还不对。提示：先找第 ${ex.upto + 1} 步及之前<b>最近的已提交 SNAPSHOT</b>，从那里开始往后一步步算。再试一次。`
          : `答案是 {${want.join(", ") || "空"}}。下面是逐步回放。`;
        if (ex.attempts >= 2) $(".txsim-check").disabled = true;
      }
      if (ok || ex.attempts >= 2) {
        $(".txsim-replay").innerHTML = steps.slice(s, ex.upto + 1).map((st, j) => {
          const i = s + j;
          const note = i === s ? "（起点：最近的已提交 SNAPSHOT）" : st.tx.aborted ? "（ABORTED，忽略）" : "";
          return `<li value="${i + 1}"><span class="tx ${st.tx.aborted ? "ABORTED" : st.tx.type}">${st.tx.type}</span> ${note} → {${st.after.join(", ") || "空"}}</li>`;
        }).join("");
      }
      $(".txsim-score").textContent = `一次答对 ${solved}/${tried}`;
    });

    $(".txsim-next").addEventListener("click", () => { idx++; render(); });
    render();
  }

  const css = `
  .txsim { border: 1px solid var(--rule); border-radius: 6px; padding: 1rem 1.1rem; margin: 1.4rem 0; }
  .txsim-head { display: flex; justify-content: space-between; gap: 1rem; font-weight: 600; }
  .txsim-hist tr.after { opacity: 0.35; }
  .txsim-chips { margin: 0.4rem 0 0.8rem; }
  .txsim-actions { display: flex; gap: 0.5rem; }
  .txsim-replay { font-family: var(--mono); font-size: 0.88rem; margin: 0.8rem 0 0; }
  .txsim-replay:empty { display: none; }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  window.TxnSim = { replay, startIndex, mountPredict, randomHistory };
})();
