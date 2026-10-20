# Palantir Foundry 数据集层 Resources

## Knowledge

- [调研笔记：research/foundry-dataset-layer.md](research/foundry-dataset-layer.md)
  本工作区的二手汇总，每条结论标注了官方页面代码。用于：快速定位某个主题该读哪页官方文档。注意它基于摘要抓取，关键措辞以原页面为准。
- [Official: Datasets（Core concepts）](https://www.palantir.com/docs/foundry/data-integration/datasets)
  数据集、事务四种类型、视图计算、schema、后端文件系统。整个主题的地基。用于：第 1 课及一切与事务/视图有关的问题。已于 2026-10-20 核对原文。
- [Official: Branching](https://www.palantir.com/docs/foundry/data-integration/branching)
  数据集分支、fallback 链、构建如何在分支上解析输入与 JobSpec。用于：分支课。
- [Official: Builds](https://www.palantir.com/docs/foundry/data-integration/builds)
  Build、Job、JobSpec、生命周期、新鲜度（staleness）。用于：构建课。
- [Official: Schedules](https://www.palantir.com/docs/foundry/data-integration/schedules)
  调度触发与运行结果语义。用于：构建课。
- [Official: Incremental transforms（Python）](https://www.palantir.com/docs/foundry/transforms-python/incremental-usage)
  增量何时退回全量、`semantic_version`、`require_incremental`。用于：增量课。
- [Official: Data Health checks reference](https://www.palantir.com/docs/foundry/data-health/checks-reference)
  全部检查类型。用于：质量课。
- [Official: Define data expectations](https://www.palantir.com/docs/foundry/maintaining-pipelines/define-data-expectations)
  Expectations 的运行时机与 FAIL/WARN。用于：质量课。
- [Official: Object backend overview](https://www.palantir.com/docs/foundry/object-backend/overview)
  Ontology 如何由 Funnel 从数据集索引。用于：Ontology 课。
- [Official: Markings](https://www.palantir.com/docs/foundry/security/markings) 与 [Projects and roles](https://www.palantir.com/docs/foundry/security/projects-and-roles)
  强制控制 vs 自主控制，沿血缘传播。用于：权限课。

## Wisdom (Communities)

- [Palantir Developer Community](https://community.palantir.com)
  Palantir 托管的 Foundry/AIP 用户论坛，分类有 Announcements、Product Feedback、Ask the Community。用于：文档没写清楚的行为（如 Expectations 与事务提交的先后），去 "Ask the Community" 搜或提问。

## Gaps

- Expectations 在输出事务提交前还是提交后执行：官方页面未明说。
- OSv2 Funnel 的索引机制细节、数据集 RID 格式：已读页面未覆盖。
- 没有可动手的 Foundry 环境，技能练习只能靠课内模拟器。
