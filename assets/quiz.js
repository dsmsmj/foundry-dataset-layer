/*
 * 选择题组件。用法：
 * <div class="quiz" data-answer="1" data-explain="解释文字">
 *   <p>题干</p>
 *   <ol><li>选项一</li><li>选项二</li></ol>
 * </div>
 * data-answer 从 0 开始。每题只能作答一次（检索练习：先想再看答案）。
 * 页面上放 <p id="quiz-score"></p> 会显示总分。
 */
(function () {
  function init() {
    const quizzes = Array.from(document.querySelectorAll(".quiz"));
    let answered = 0, correct = 0;
    const scoreEl = document.getElementById("quiz-score");
    const renderScore = () => {
      if (scoreEl) scoreEl.textContent = answered ? `已答 ${answered}/${quizzes.length}，答对 ${correct}` : "";
    };

    quizzes.forEach((q, qi) => {
      const answer = Number(q.dataset.answer);
      const list = q.querySelector("ol");
      const items = Array.from(list.children);
      const opts = document.createElement("div");
      opts.className = "quiz-options";
      opts.setAttribute("role", "group");
      const fb = document.createElement("div");
      fb.className = "feedback";
      fb.setAttribute("aria-live", "polite");

      items.forEach((li, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn quiz-opt";
        b.innerHTML = `<span class="muted">${String.fromCharCode(65 + i)}.</span> ${li.innerHTML}`;
        b.addEventListener("click", () => {
          opts.querySelectorAll("button").forEach((x) => (x.disabled = true));
          const ok = i === answer;
          answered++; if (ok) correct++;
          b.classList.add(ok ? "chosen-ok" : "chosen-bad");
          opts.children[answer].classList.add("is-answer");
          fb.className = "feedback " + (ok ? "ok" : "bad");
          fb.innerHTML = (ok ? "对。" : `不对，答案是 ${String.fromCharCode(65 + answer)}。`) +
            (q.dataset.explain ? " " + q.dataset.explain : "");
          renderScore();
        });
        opts.appendChild(b);
      });
      list.replaceWith(opts);
      q.appendChild(fb);
      q.setAttribute("aria-label", `第 ${qi + 1} 题`);
    });
    renderScore();
  }

  const css = `
  .quiz { margin: 1.4rem 0; padding: 0.9rem 1.1rem; border: 1px solid var(--rule); border-radius: 6px; }
  .quiz > p:first-child { margin-top: 0; font-weight: 600; }
  .quiz-options { display: grid; gap: 0.4rem; }
  .quiz-opt { text-align: left; border-color: var(--rule); line-height: 1.5; }
  .quiz-opt:disabled { opacity: 1; cursor: default; }
  .quiz-opt.is-answer { border-color: var(--ok); color: var(--ok); }
  .quiz-opt.chosen-bad { border-color: var(--bad); color: var(--bad); text-decoration: line-through; }
  @media print { .quiz-opt { display: block; } }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
