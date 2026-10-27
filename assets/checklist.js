/*
 * 自评清单组件。用法：
 * <div class="checklist" data-title="自评">
 *   <details><summary>文件</summary><p>参考答案…</p></details>
 *   …
 * </div>
 * 每项前面加一个"我画对了"的勾选框，底部显示勾选数。
 * 参考答案默认折叠：先在纸上自己写，再展开对照。
 */
(function () {
  function init() {
    document.querySelectorAll(".checklist").forEach((box) => {
      const items = Array.from(box.querySelectorAll(":scope > details"));
      const score = document.createElement("p");
      score.className = "muted cl-score";
      const update = () => {
        const n = box.querySelectorAll(".cl-check:checked").length;
        score.textContent = `自评：${n}/${items.length} 环写对了`;
      };
      items.forEach((d, i) => {
        const row = document.createElement("div");
        row.className = "cl-row";
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.className = "cl-check"; cb.id = `cl-${i}`;
        cb.addEventListener("change", update);
        const lab = document.createElement("label");
        lab.htmlFor = cb.id; lab.className = "muted"; lab.textContent = "我写对了";
        d.before(row);
        row.appendChild(d);
        row.appendChild(cb);
        row.appendChild(lab);
      });
      box.appendChild(score);
      update();
    });
  }

  const css = `
  .checklist { margin: 1rem 0; }
  .cl-row { display: grid; grid-template-columns: 1fr auto auto; gap: 0.4rem; align-items: start; border-bottom: 1px solid var(--rule); padding: 0.5rem 0; }
  .cl-row summary { cursor: pointer; font-weight: 600; }
  .cl-row details p { margin: 0.3rem 0 0; font-size: 0.95rem; }
  .cl-row label { font-size: 0.85rem; padding-top: 0.15rem; }
  .cl-check { margin-top: 0.45rem; }
  .cl-score { font-weight: 600; }
  @media print { .cl-row details > *:not(summary) { display: none; } .cl-check, .cl-row label { display: none; } }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
