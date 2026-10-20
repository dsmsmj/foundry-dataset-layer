# Mission: Palantir Foundry 数据集层

## Why
纯粹想搞懂 Foundry 的数据集层是怎么运作的，作为个人技术积累，目前没有具体落地场景。（每节课都用"这条链路上它处在哪里"来锚定，避免学成零散知识点。）

## Success looks like
- 不看资料，能在白纸上画出 文件 → 事务 → 视图 → 分支 → 构建 → 质量检查 → Ontology → 权限 这条链路，并讲清每一环做什么
- 给出一串事务历史，能说出某个时间点的视图包含哪些文件
- 能解释一次构建为什么跳过、为什么从增量退回全量
- 能说清 Markings 和项目角色在血缘上传播方式的区别

## Constraints
- 每次学习约 30 分钟
- 相关概念（数据湖表格式、管道编排、数据治理）基础都不太熟，需要从基本概念讲起
- 知识只认 palantir.com/docs 官方文档；没有 Foundry 实操环境

## Out of scope
- 在 Foundry 上实际写 transform 代码、搭管道
- 为 Prothentic 平台设计数据层（之后若目标变化再更新本文件）
- Ontology 本身的建模（对象类型、链接、Action），只学它如何读取数据集
