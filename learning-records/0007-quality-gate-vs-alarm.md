# 掌握 Expectation（关卡）与 Data Health（报警器）的区别

2026-10-27 第 5 课（短课）收尾三题基本全对：
- "Expectation 是哨卡，Data Health 是过了哨卡后的报警器"，并知道 Expectation 能挡住坏数据；
- FAIL 终止、WARN 只告警、默认 FAIL；
- pre-condition 挂输入、post-condition 挂输出。
小偏差：把 Expectation 说成"上游哨卡"，并只举了"schema 不合法"——实际上它在构建 Job 运行期间检查，挂在本 transform 的输入或输出上，能检查主键、非空、取值范围等多种内容；也没有说出"为什么能挡住"（Job 中止 → 输出事务 ABORTED → 文件不进视图）。

**Implications**：短课形式（15～20 分钟、一个点、多回忆题）效果明显好于前两节长课，保持该形式。下一课热身题可以复查"为什么 FAIL 能挡住坏数据"这条跨课推理。
