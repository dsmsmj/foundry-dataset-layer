/*
 * 作答区组件：页面里带 data-key 的 input / textarea 会自动保存在本浏览器里（刷新不丢），
 * 并提供"复制我的答案"按钮，把所有作答整理成文本，方便发给老师。
 *
 * <div class="notepad" data-store="lesson-0008">
 *   <input data-key="s1-name" data-label="第 1 环 名称"> …
 *   <textarea data-key="s1-body" data-label="第 1 环 是什么/规则"></textarea> …
 * </div>
 * 存储只是个人便利：在隐私模式或禁用存储时照常可用，只是不保存。
 */
(function () {
  function storage() {
    try { const k = "__np"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return localStorage; }
    catch (e) { return null; }
  }

  function init() {
    const ls = storage();
    document.querySelectorAll(".notepad").forEach((pad) => {
      const ns = pad.dataset.store || "notepad";
      const fields = Array.from(pad.querySelectorAll("[data-key]"));
      fields.forEach((f) => {
        const key = `${ns}:${f.dataset.key}`;
        try { if (ls && ls.getItem(key) != null) f.value = ls.getItem(key); } catch (e) { /* 忽略 */ }
        f.addEventListener("input", () => { try { if (ls) ls.setItem(key, f.value); } catch (e) { /* 忽略 */ } });
      });

      const bar = document.createElement("div");
      bar.className = "np-bar no-print";
      bar.innerHTML = `<button type="button" class="btn primary np-copy">复制我的答案</button>
        <button type="button" class="btn np-clear">清空重写</button>
        <span class="muted np-msg" aria-live="polite">${ls ? "作答会自动保存在这个浏览器里" : "当前浏览器不能保存，关页面前记得复制"}</span>`;
      pad.appendChild(bar);
      const msg = bar.querySelector(".np-msg");

      bar.querySelector(".np-copy").addEventListener("click", async () => {
        const text = fields.map((f) => `${f.dataset.label || f.dataset.key}：${f.value.trim() || "（空）"}`).join("\n");
        try { await navigator.clipboard.writeText(text); msg.textContent = "已复制，直接粘贴发给老师即可"; }
        catch (e) {
          const ta = document.createElement("textarea");
          ta.value = text; document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); msg.textContent = "已复制，直接粘贴发给老师即可"; }
          catch (e2) { msg.textContent = "复制失败，请手动选中复制"; }
          ta.remove();
        }
      });
      bar.querySelector(".np-clear").addEventListener("click", () => {
        fields.forEach((f) => { f.value = ""; try { if (ls) ls.removeItem(`${ns}:${f.dataset.key}`); } catch (e) { /* 忽略 */ } });
        msg.textContent = "已清空";
      });
    });
  }

  const css = `
  .notepad { margin: 1rem 0; }
  .np-item { border: 1px solid var(--rule); border-radius: 6px; padding: 0.6rem 0.8rem; margin-bottom: 0.6rem; }
  .np-item .np-head { display: flex; gap: 0.6rem; align-items: center; margin-bottom: 0.4rem; }
  .np-item .np-num { font-family: var(--serif); font-weight: 600; white-space: nowrap; }
  .notepad input, .notepad textarea {
    font: inherit; font-size: 0.95rem; color: var(--fg); background: var(--bg);
    border: 1px solid var(--rule); border-radius: 4px; padding: 0.35rem 0.5rem; width: 100%;
  }
  .notepad input:focus, .notepad textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .notepad textarea { min-height: 4.2rem; resize: vertical; line-height: 1.6; }
  .np-bar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.4rem; }
  .np-msg { font-size: 0.85rem; }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
