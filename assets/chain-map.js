/*
 * 8 环记忆地图：文件 → 事务 → 视图 → 分支 → 构建 → 质量检查 → Ontology → 权限。
 * 每张卡片正面是名称 + 一句话 + 比喻，规则折叠在下面，点开再看。
 * 用法：<div class="chain-map" data-base="../lessons/"></div>
 *   data-base 是课程目录相对当前页面的路径，用来生成"回到第 N 课"的链接。
 * 内容只用课程里讲过、并已对照官方文档核对的结论。
 */
(function () {
  const LINKS = [
    { name: "文件", what: "数据集是后端文件系统里一组文件的包装。", hook: "仓库里的货：货在后端仓库，Foundry 只记货架位置。",
      rule: "文件不在 Foundry 里；DELETE 只让文件离开视图，物理删除要等保留策略。", lesson: [1] },
    { name: "事务", what: "对数据集的一次原子改动，像 Git 的一次提交。", hook: "贴贴纸：SNAPSHOT 贴一张新的大贴纸盖住旧的，APPEND 往旁边加，UPDATE 加或盖住一张，DELETE 撕掉一张。",
      rule: "只有 COMMITTED 生效，ABORTED 被忽略；事务只增不减，DELETE 也是一条新事务。", lesson: [1] },
    { name: "视图", what: "某个分支、某个时间点上实际有效的文件。", hook: "找到最近那张大贴纸，从它开始往后数。",
      rule: "从该时间点之前最近的已提交 SNAPSHOT 开始，按顺序回放已提交的事务。", lesson: [1] },
    { name: "分支", what: "指向最新事务的指针，不存数据，不能合并。", hook: "找东西：先翻自己房间（feature），再客厅（develop），再储藏室（master）。借来用，不在自己房间造一个。",
      rule: "输入往后退着读、从不在输入上建分支；输出只写在构建分支上，缺分支时从第一个 fallback 建。", lesson: [2] },
    { name: "构建", what: "由 Job 按 JobSpec 计算输出的新版本，提交新事务。", hook: "多米诺：上游一倒（提交新事务），下游的输入就变了，跟着倒。增量像记账：只记新流水、往后追加。",
      rule: "输入和 JobSpec 都没变就新鲜、跳过；每个 Job 各管各的事务；增量只在输入只追加时可行，否则退回快照。", lesson: [3, 4] },
    { name: "质量检查", what: "Expectation 在构建里检查；Data Health 在构建后检查。", hook: "安检门 vs 烟雾报警器：一个进门前拦，一个火烧起来才响。",
      rule: "Expectation 的 FAIL（默认）中止 Job，输出事务被放弃，坏数据进不了视图；Data Health 只告警。", lesson: [5] },
    { name: "Ontology", what: "对象的数据来自数据集，中间由 Funnel 索引进对象数据库。", hook: "仓库的书 → 编目员（Funnel）→ 检索目录（对象数据库）。读者查目录，不翻仓库。",
      rule: "对象跟着已提交的数据走；用户编辑落在对象层；OSv2 的支撑数据集回滚后要人工介入。", lesson: [6] },
    { name: "权限", what: "角色 + 标记（Marking），两样都满足才能访问。", hook: "门禁卡 + 封条：卡要能刷开，每张封条你都得有资格拆。",
      rule: "角色只沿项目往下继承，不沿血缘；标记还沿血缘传到派生数据集，任何角色都绕不过。", lesson: [7] }
  ];
  const FILES = {
    1: "0001-transactions-and-views.html", 2: "0002-branches-and-fallback.html", 3: "0003-builds-and-staleness.html",
    4: "0004-incremental-vs-snapshot.html", 5: "0005-expectations-vs-health-checks.html",
    6: "0006-ontology-reads-datasets.html", 7: "0007-roles-vs-markings.html"
  };

  function render(el) {
    const base = el.dataset.base || "";
    el.innerHTML = `<ol class="cm-grid">${LINKS.map((l, i) => `
      <li class="cm-card">
        <div class="cm-top"><span class="cm-num">${i + 1}</span><span class="cm-name">${l.name}</span></div>
        <p class="cm-what">${l.what}</p>
        <p class="cm-hook">${l.hook}</p>
        <details><summary>规则</summary><p>${l.rule}</p>
          <p class="cm-src">${l.lesson.map((n) => `<a href="${base}${FILES[n]}">第 ${n} 课</a>`).join(" · ")}</p></details>
      </li>`).join("")}</ol>`;
  }

  const css = `
  .cm-grid { list-style: none; padding: 0; margin: 1.2rem 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; counter-reset: none; }
  @media (max-width: 620px) { .cm-grid { grid-template-columns: 1fr; } }
  .cm-card { border: 1px solid var(--rule); border-radius: 6px; padding: 0.7rem 0.9rem; position: relative; }
  .cm-card:not(:last-child)::after { content: "→"; position: absolute; right: -0.65rem; top: 0.7rem; color: var(--accent); font-weight: 600; background: var(--bg); }
  .cm-card:nth-child(2n)::after { content: "↓"; right: auto; left: -0.5rem; top: auto; bottom: -0.85rem; }
  @media (max-width: 620px) { .cm-card:not(:last-child)::after { content: "↓"; right: auto; left: 1rem; top: auto; bottom: -0.9rem; } }
  .cm-top { display: flex; align-items: baseline; gap: 0.5rem; }
  .cm-num { font-family: var(--mono); color: var(--accent); font-weight: 600; }
  .cm-name { font-family: var(--serif); font-size: 1.15rem; font-weight: 600; }
  .cm-what { margin: 0.3rem 0 0.2rem; }
  .cm-hook { margin: 0 0 0.3rem; color: var(--muted); font-size: 0.92rem; }
  .cm-card details summary { cursor: pointer; font-size: 0.9rem; color: var(--accent); }
  .cm-card details p { margin: 0.3rem 0 0; font-size: 0.93rem; }
  .cm-src { font-size: 0.82rem; }
  @media print { .cm-card { break-inside: avoid; } .cm-card details { display: block; } .cm-card details > * { display: block; } .cm-card::after { display: none; } }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function init() { document.querySelectorAll(".chain-map").forEach(render); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
