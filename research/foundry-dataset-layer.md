# Palantir Foundry 数据集层（Dataset Layer）调研

调研日期：2026-10-20。仅使用 palantir.com/docs 官方页面。抓取方式为 WebFetch 返回的摘要，引用为页面级（非逐字核对原文），关键措辞请以原页面为准。部分页面搜索结果标注为很旧（>1000 天），行为可能已变。

引用缩写（均为 https://www.palantir.com/docs/foundry/ 前缀）：
- [DS] data-integration/datasets
- [BR] data-integration/branching
- [VW] data-integration/views
- [BD] data-integration/builds
- [SCH] data-integration/schedules
- [HC] data-integration/health-checks
- [DH] data-health/overview
- [CT] data-health/check-types
- [RHC] maintaining-pipelines/recommended-health-checks
- [PBHC] pipeline-builder/dataexpectations-configure-health-check
- [PBB] pipeline-builder/branches-overview
- [PBF] pipeline-builder/branches-fallback-branches
- [LIN] data-lineage/overview
- [LBD] data-lineage/build-datasets
- [RB] data-lineage/dataset-rollback
- [RET] retention/policy-execution
- [INC] transforms-python/incremental-usage
- [OB] object-backend/overview
- [MIG] object-backend/osv1-osv2-migration
- [MAT] object-edits/materializations
- [MK] security/markings
- [PR] security/projects-and-roles
- [ACP] security/access-control-propagation
- [RM] building-pipelines/remove-markings
- [CR] data-health/checks-reference
- [ODH] observability/data-health
- [DEG] transforms-python/data-expectations-getting-started
- [DER] transforms-python/data-expectations-reference
- [DDE] maintaining-pipelines/define-data-expectations
- [PBDE] pipeline-builder/dataexpectations-overview
- [DC] data-connection/overview
- [TT] dataset-preview/time-travel
- [DLT] data-lifetime/core-concepts-data-lifetime
- [PROJ] optimizing-pipelines/projections-overview

（完整 URL 例：[DS] = https://www.palantir.com/docs/foundry/data-integration/datasets）

## TL;DR 心智模型

- Dataset = 一组文件的包装 + 元数据（schema、事务历史、分支），文件本身不在 Foundry 里，在后端文件系统（HDFS/S3 等）里；Foundry 维护逻辑路径到物理路径的映射 [DS]。
- 变更只通过 transaction 发生（类比 Git commit，原子）；"当前数据"= 某分支上某时间点的 view，由最近一个 SNAPSHOT 起依次回放事务算出 [DS]。
- 分支像 Git 的指针但不能合并（"no support for merging dataset branches"）；build 在指定分支运行，输入/JobSpec 通过 fallback 分支链解析 [BR]。
- Build 由 JobSpec 驱动；输入与逻辑未变则输出 fresh，不重算（除非 force build）[BD]。增量 vs 全量取决于输入事务类型（APPEND 友好，SNAPSHOT/改写式 UPDATE 强制 snapshot）[INC]。
- 下游：Ontology 由 Funnel 从数据集索引成对象 [OB]；权限 = Project 角色（自主，向下继承）+ Markings（强制，沿文件层级和血缘数据依赖传播）[PR][MK]。

## 1. Dataset 是什么

- 定义："Fundamentally, a dataset is a wrapper around a collection of files." 提供权限管理、schema 管理、版本控制和随时间更新 [DS]。
- 存储：文件不存放在 Foundry 自身；维护"文件逻辑路径 -> 后端文件系统物理路径"的映射。后端由 Hadoop FileSystem 的 base directory 指定（如 HDFS、S3 等云存储），所有数据集文件在其下的目录层级中 [DS]。
- 数据类型：结构化（如 Parquet，列信息存为 schema）、非结构化（无 schema，如图片/PDF，可存无 schema 数据集或 media set）、半结构化（XML/JSON，上传到无 schema 数据集，下游再推断表结构）[DS]。
- 常见文件格式：Parquet、Avro、Text（Text 可表示 CSV 变体或 JSON，解析细节放在 `customMetadata`）；JSON/XML 建议先存无 schema 数据集，在下游转换中套 schema [DS]。
- Schema：是"dataset view 上的元数据"，定义文件如何解析、列名与类型；不保证文件真的符合 schema；因存在 view 上，schema 可随时间变化。字段类型：BOOLEAN, BYTE, SHORT, INTEGER, LONG, FLOAT, DOUBLE, DECIMAL, STRING, MAP, ARRAY, STRUCT, BINARY, DATE, TIMESTAMP [DS]。
- RID：[DS] 页面明确不涉及 RID；路径仅涉及逻辑/物理路径。RID 格式未在已读官方页面中确认（见"未确认"）。

## 2. Transactions

- 定义："A transaction is analogous to a commit in Git: an atomic change to the contents of a dataset." [DS]
- 状态：OPEN（可写文件）-> COMMITTED（写入的文件进入最新 view）或 ABORTED（期间写入的文件被忽略）[DS]。
- 类型 [DS]：
  - SNAPSHOT：用全新文件集替换当前 view，批处理管道基础。
  - APPEND：只加新文件，不能修改现有文件，增量管道基础。
  - UPDATE：可加文件，也可覆盖已有文件；覆盖会破坏 append-only 增量性，使下游回到 SNAPSHOT 处理。
  - DELETE：从当前 view 移除文件；提交 DELETE "does not delete the underlying file from the backing file system"。
- 示例（[DS]）：SNAPSHOT {A,B} -> APPEND C -> UPDATE A→A' -> DELETE B，view 为 {A', C}；之后 SNAPSHOT {D} 开启新 view，仅含 D。
- 分支上的事务保证：一个分支至多一个 open 事务且必为最新；分支内按开始/提交时间有序，跨分支无顺序保证 [BR]。
- 文件同步（ingestion）模式：batch mirror（SNAPSHOT，每次全量）、incremental mirror（APPEND，仅新文件）、incremental mirror（UPDATE，新增和修改文件）[DS]。

## 3. 分支（Branching）

- 数据集分支是指向最新事务的指针；分支是按提交时间排序的线性序列；非 root 分支有一个 parent，多数数据集只有一个 root `master` [BR]。
- 操作：创建 root 分支、从另一分支或任意事务创建子分支、在分支上开事务、删除分支（只删指针，不删事务）；删除中间分支时子分支改挂到其 parent，事务不移动 [BR]。
- 合并：官方明确 "Unlike Git, there is no support for merging dataset branches." [BR]。"合并"发生在代码层（Code Repositories 的 pull request 把转换逻辑合入 master），数据靠在 master 上重新 build [BR]。
- Build 与分支 [BR]：每个 build 在用户指定的分支运行，只改该分支上的数据集。两个用途：(1) job graph 编译：从相应分支收集 JobSpec；(2) 输入/输出解析：按 build 分支 + fallback 分支链解析。示例：链 `develop --> master`，若 develop 上某输出无 JobSpec，则读 master 的 JobSpec。输出在 build 分支上开事务，若该分支不存在则从第一个 fallback 分支创建（无 fallback 则建 root）；输入优先取 build 分支，否则取第一个存在的 fallback。保证：build 不改其它分支，也不会在输入数据集上创建分支。
- Code Repositories：在代码仓库分支提交代码会把 JobSpec 发布到 build 系统的对应分支；一个分支预期只有一个活跃开发者 [BR]。
- Pipeline Builder [PBB][PBF]：分支是 pipeline 的工作副本（每个 pipeline 一个 main）；可开启保护分支，要求先在独立分支修改并通过 proposal 合入，可选"至少一个审批"（审批人需有 Edit 权限且未贡献该变更）；输入数据集在当前分支未构建时按 fallback 列表查找，默认分支自动成为 fallback；与 Code Repositories 同名分支可读取该分支的输入数据集。配置：Settings > Manage branches > Fallback branches。
- Data Lineage 中的 build 始终使用图中配置的分支（含 fallback）[LBD]。

## 4. Views、历史与保留

- Dataset view："the effective file contents of a dataset for a branch at a point in time." 计算：从该时间点之前最近的 SNAPSHOT（无则最早事务）开始，依次应用事务（SNAPSHOT/APPEND 加文件，UPDATE 加并替换，DELETE 移除）；历史中 view 数量等于 SNAPSHOT 事务数；一个 view 可含多个分支的事务 [DS]。
- 注意区分：Data Integration 里的 "View"（大写）是另一概念——不持有文件，读时对多个 backing dataset 做 union；backing 数据集必须列名/类型一致；可设 primary key 去重（保留指定列值最高的行，先去重再按 deletion 列排除）；不能作为 transform 输出；构建几乎瞬时 [VW]。
- 查看历史：数据集 History 标签页；回滚后被回滚的事务显示为划线 [RB]。
- Time Travel（Dataset Preview）[TT]："Time Travel builds its timeline from committed Catalog dataset transactions or Iceberg table snapshots."；时间线上每个点是一个已提交版本；有 Single version（看某版本的数据和 schema）与 Range 两种视图；"You can only inspect versions where data is still available under the applicable retention policy."；Bisect 只在页面已加载的版本中搜索。页面未提分支。
- Projections [PROJ]：由 Noho 服务管理、在 schema 中引用的加速结构（每个 projection 通常服务一种 filter 或 join 模式）；"Projections can only be added to datasets that are append-only."；只允许 APPEND、SNAPSHOT 以及只加行的 UPDATE，违反时系统自动禁用 projection；只要 projection 上次构建的事务到最新事务之间没有 SNAPSHOT/DELETE/改写文件的 UPDATE，未完全更新的 projection 仍可被使用；可透明地压缩增量管道；不支持 schema evolution。
- 回滚 [RB]：两种——回滚到更早事务，或强制下次 build 为 snapshot（不改事务历史）。只有事务型数据集可回滚；只能回滚到成功事务；不能回滚到已被保留策略删除的事务；需要数据集 `Editor` 角色；回滚不改变数据集背后的逻辑；多输出 job 必须一起回滚到同一次 job 的事务，否则不一致；OSv2 支撑的对象类型需手动重新索引。
- 保留（Retention）[RET][DS]：策略先"标记"事务，大约 7 天后 sweep 永久删除（页面称时长可能变化）；标记后可修改策略并在 7 天内联系 Palantir 恢复，之后不可恢复；默认不标记各分支的最新 view（"Allow deletion from latest view" 可覆盖，但可能删掉在用数据并导致增量构建失败）；各分支独立评估；评估循环可能需几天；Python 增量转换应设 `allow_retention=True` 以免保留删除触发 snapshot。DELETE 事务本身不物理删文件，保留策略才删 [DS]。
- Data Lifetime [DLT]：在 namespace 级定义"lineage-aware"保留策略，给数据集所有事务分配删除日期；策略类型有固定删除日期、仅保留 latest view（不在当前 view 的事务立即标记删除）；"when a transaction is deleted, all downstream transactions derived from that transaction are also removed."，建议施加在 root/上游数据集。与普通 retention 区别：retention 策略"are not lineage-aware and thus do not propagate to downstream datasets"；且"Data Lifetime does not consider other retention policies when showing deletion dates for transactions."。override 细节在单独的 policy-overrides 页面（未读）。

## 5. Builds、Schedules、JobSpec、Lineage

- Build："the mechanism used to compute new versions of datasets"；由多个 job 组成，job 是共享逻辑的工作单元；多输出 job 的输出总是一起更新，不能只构建部分输出 [BD]。
- JobSpec：定义 job 如何构造（输入依赖+逻辑），InputSpec 按 view 声明读取子集；变更转换逻辑（如提交代码）时发布 JobSpec；job 类型含 Data Connection sync、代码仓库 transform、health check、分析应用逻辑、导出 [BD]。
- Job 状态：WAITING, RUN_PENDING, RUNNING, ABORT_PENDING, ABORTED, FAILED, COMPLETED [BD]。
- Build 生命周期：解析阶段检查环（有环则失败）、验证输入与 schema、在输出上开事务（build locking），可能因其它 build 会改变其输入而排队；执行阶段独立 job 并行；job 失败则直接依赖的 job 和输出事务被终止；已完成 job 可能已写入数据（部分结果）[BD]。
- Staleness：解析时输入与 JobSpec 逻辑自上次 build 未变，则输出 fresh，后续 build 不重算；force build 无视这点全部重算 [BD]。Data Lineage 可将过期数据集着色；Build All Ancestors 默认只建过期祖先；force build 可能代价高昂 [LIN][LBD]。
- Schedules：trigger 满足条件才运行关联 build；触发时若上次运行仍在进行，则等它结束再运行；run 结果 Ignored 通常表示一切最新；Succeeded 仅表示 build 已成功启动；暂停会重置 trigger 状态；可用用户模式（受用户权限变化影响）或项目范围模式 [SCH]。最佳实践（搜索摘要）：每个数据集只由一个 schedule 构建 [见 building-pipelines/scheduling-best-practices，仅摘要]。
- 增量 vs 快照（Python 转换）[INC]：不满足条件则自动退化为 snapshot（输出写模式变 replace，读上次输出得空 DataFrame）。强制 snapshot 的条件：非 snapshot 输入出现 SNAPSHOT 事务；出现改写已有文件的 UPDATE 或未被 `allow_retention`/`allow_user_deletes` 允许的 DELETE；输入起始事务与上次不同；多输出时某输出上次由不同 transform 构建；无输入。`require_incremental=True` 令其失败而非退化（首次构建或 semantic_version 变更除外）。`semantic_version` 变化强制下次非增量；默认 1。`snapshot_inputs` 可排除允许整体重写的输入（搜索摘要）。

## 6. Data Health 与 Data Expectations

### 6.1 Data Health（health checks）

- 定义：监控并告警数据集及其它资源的常见问题（状态、时间、大小、内容、schema）[DH]。Observability 页把 Data Health 分成两块：monitoring views（"Monitor resources at scale using scope-based monitoring rules."）与 health checks（"Use health checks when you need fine-grained validation of a specific resource's data quality, agnostic of a workflow."）[ODH]。
- 告警渠道 [ODH]："Data Health notifies you through in-platform notifications, email digests, and integrations with external systems."；外部："Send alerts to PagerDuty, Slack, or arbitrary REST endpoints through built-in integrations."；邮件为可配置周期的聚合摘要。[DH] 页仅写平台内通知 + 邮件。
- 每个检查的告警选项 [CR]：Severity（Moderate / Critical）、Escalate（连续失败后升级）、Issues（失败时自动建 issue）。[PBHC] 措辞为 Moderate/Severe，与 [CR] 不一致，以 [CR] 为准存疑。
- 挂载对象 [DH][ODH]：数据集/表在 Dataset Preview 的 Health 标签；schedule 在 Data Lineage 中 "Metrics > Health"；也可在 Lineage 多选数据集批量添加，或在 Data Health 应用中添加。[ODH] 将 health checks 描述为 "Detailed content and schema validation on individual datasets and schedules."。注意 [CR] 中 Schedule status 的"支持资源"列为 Datasets（即挂在数据集上、但按 schedule 运行评估），[CT] 称 schedule 检查 "are only triggered when the check's configured schedule runs"。
- 完整检查清单 [CR]（括号内为支持资源；未注明者仅 Datasets）：
  - Status：Schedule status、Build status（Datasets/Iceberg/Virtual tables）、Job status（同上）、Sync status。
  - Time：Build duration、Data freshness、Sync duration、Sync freshness、Time since last updated（Datasets/Iceberg/Virtual tables）、Time since sync last updated。
  - Size：Dataset file count、Dataset partition（"the check passes if at least 90% of the files are more than 96MB in size."）、Row count、Transaction file count、Transaction file size。
  - Content：Allowed column values、Approximate unique percentage、Column regex、Approximate column relation、Date range、Null percentage、Numeric mean、Numeric median、Numeric range、Primary key（Datasets/Iceberg/Virtual tables）。
  - Schema：Column（三类）、Column count、Schema（三类）。
- 关键定义（[CR] 原文）：Job status "Checks whether the most recent job run on a dataset succeeded or failed."；Schedule status "Checks whether the most recent build of the schedule succeeded or failed."；Time since last updated "Checks whether the total time since the dataset has updated (had a new transaction) meets some threshold."；Row count "Checks the total number of rows in the dataset."
- Sync 类检查不是 Data Connection 入库检查：[CR] 原文 Sync status "Checks whether the most recent sync of the dataset to another database succeeded or failed."；Time since sync last updated "Checks whether the total time since the dataset last synced to some destination meets some threshold."；"Sync destination" 选项说明为 "Which sync of the dataset to monitor, relevant especially when the dataset syncs to multiple destinations."，示例值 `phonograph2-cache-worker`、`jdbc-worker`。即这里的 "sync" 指数据集向外（下游数据库/索引）同步，[CR] 全页未提 Data Connection 或 ingestion。（`phonograph2-cache-worker` 名称暗示与 OSv1 Phonograph 有关，但页面未解释，属推断。）
- 评估时机 [CT]：job status 在目标数据集被构建时运行，上游失败则不评估；data freshness "is only run when a transaction is committed."；time since last updated 计入空事务；"Most standard health checks depend on jobs to finish in order to compute."。
- 推荐 [RHC]：所有 schedule 加 schedule status（"This will catch all failures in a pipeline; it is not necessary to put a Job Status Check on each dataset."）+ duration；输入/输出加 schema check；输出用 TSLU（如每日 9 点 build 约 1 小时，阈值 26 小时，开启 auto-resolve）；被同步的数据集加 sync status + sync freshness；"only one check of a given type can exist on a particular dataset."。

### 6.2 Data Expectations

- 定义 [DDE]："a set of requirements defined in code on dataset, virtual table, and Iceberg table inputs or outputs."；expectation 是对结构/内容的要求，check 把 expectation 以一个名字组合。
- 声明位置：
  - Python transforms（Code Repository）[DEG]：`Check(expectation, 'name', on_error='WARN'|'FAIL')`，通过 `checks=` 挂在 `Input` 或 `Output` 上；"Each check should be passed to a single input or output."；名字在 transform 内唯一，并"will identify the check across apps (e.g. Data Health, Builds application)."。示例（[DEG]）：`Output("/path/dataset", checks=Check(E.primary_key('id'), 'Primary Key', on_error='FAIL'))`。
  - Pipeline Builder [PBDE]："Data expectations can be set on each pipeline output to define an expectation on the resulting output."；类型：Primary key、Row count、Value is one of、Value is not null、Floats and doubles are not NaN、Row-level。
- 运行时机 [DDE]："The registered checks will run as part of the build job."。输入上的检查为 pre-condition，输出上的为 post-condition；"When a pre-condition fails the output of the transform will be aborted."；要阻止某输入数据集本身被构建出坏数据，需在产出该输入的 transform 上定义 post-condition。文档未明确说明检查是在输出事务提交前还是提交后执行（见未确认）。
- FAIL vs WARN [DEG]："`FAIL` (default) - Job will be aborted if check fails"；"`WARN` - Job will continue and a warning will be generated and handled by Data Health"。[DDE]：FAIL 时 job 状态变为 "Aborted"。结合 [DS]（ABORTED 事务中写入的文件被忽略）与 [BD]（job 失败时其输出事务被终止）可推断 FAIL 不会产出可见的新数据，但 expectations 页面本身未直接写"事务被 abort"。Pipeline Builder："If any expectations fail, the build will fail." [PBDE]（页面未提 WARN 级别）。
- 可用 expectation（Python）[DER]：operators（`true/false/all/any/negate`）；列比较（`gt/gte/lt/lte`、`*_col`）；列属性（`null_percentage`、`null_count`、`distinct_count`、`approx_distinct_count`、`sum`、标准差）；值（`equals`、`is_in`、`rlike`、`has_type`、`non_null`、`exists` 等）；timestamp（静态、列比较、相对当前时间、`max_value/min_value`，仅 Timestamp 类型，"`Date` columns are not currently supported."）；array；group-by（`is_unique`、`count`）；`primary_key`；schema（`contains/equals/is_subset_of`）；条件（`when/otherwise`）；跨数据集行数比较；foreign value（`dataset_ref`、`is_in_foreign_col`，"in the experimental phase of development and may not be available on your enrollment."，涉及 join，代价高）。
- 限制：虚拟表输出在 single-node transforms 中不支持 `on_error='FAIL'` [DEG]；搜索摘要另称所有检查在全量数据上运行（不论 transform 是否增量）、lightweight transforms 不支持 foreign value——这两条未在已读页面正文中确认。
- 与 Data Health 的关系 [DDE]："Data Expectations are integrated with Data Health for monitoring."；每次检查运行把结果上报 Data Health，最新结果出现在 Dataset Preview 的 Health 标签，可在那里配置通知；检查历史只在 check 名不变时保留。复合 expectation 作为一个整体监控，要细粒度监控需拆成多个 check [DEG]。
- 与普通 health check 的分工 [CT]：health check 在 job 结束后计算、只告警；expectation 在 build job 内运行、可中止 build。

### 6.3 这两者属于 ingestion 层还是 dataset/build 层？

结论：两者都在 dataset/build 层，不是 Data Connection（ingestion）专属功能。Data Connection 的 sync 只是 build 系统里的一种 job，它产出的数据集与其他数据集一样受这两者监控。依据：
- Data Connection sync 被列为 build 系统中的一种 job 类型（与 transform、health check、export 并列）[BD]，它把数据写到 "destination dataset"，即 Foundry 管道的起点 [DC]。因此 job status 等检查对 sync 产出的数据集同样有效（这一点是推断，文档未逐字说明）。
- Health checks 挂在数据集/表/schedule 上，配置入口是 Dataset Preview、Data Lineage 和 Data Health 应用 [DH][ODH]；检查依据的是事务、job、build、schedule 这些 build 层概念 [CR][CT]。
- Expectations 定义在 transform 的 Input/Output 上（Code Repository 或 Pipeline Builder 输出），"run as part of the build job" [DDE][DEG][PBDE]。已读页面没有任何在 Data Connection sync 本身上声明 expectations 的方式。
- [CR] 中的 "Sync" 类检查指的是数据集向外部数据库/目的地同步，不是 Data Connection 入库 sync [CR]。
- Data Connection 概述提到 "an integrated data health monitoring system to alert on critical failures"，以及 "automatic retries upon failures" [DC]，但没有说明它和 Data Health 的具体对接方式。[RHC] 建议对 Data Connection sync 产出或无人负责的输入数据集使用 schedule status check。

## 7. 与 Ontology 的关系

- OSv2 的 Funnel 从 Foundry datasource（数据集、restricted view、streaming）和 Actions 的用户编辑读取，索引进 object database，并随底层 datasource 更新保持索引新鲜 [OB]。OSv2 对所有对象类型默认增量索引 [OB]。
- OSv1（Phonograph）是遗留后端，页面称 2026-06-30 后不可用；需迁移 [OB][MIG]。
- Writeback dataset（OSv1）：启用用户编辑所必需；OSv2 以可选的 materialization 取代，用户编辑通过 Ontology Manager 的 Edits 开关启用 [MIG][MAT]。
- Materialization 传播 [MAT]：自动模式延迟数分钟（构建更频繁，成本更高）；周期模式在输入有新数据或每 6 小时重建；OSv2 保留期固定，仅保证最新 snapshot，要保留历史需下游 transform；schema 来自 Ontology 属性 API name；`__` 前缀列为内部去重元数据，勿用于生产；OSv1 writeback 不会因编辑自动触发构建，需自建 schedule；materialization 不能在分支上创建或编辑。
- 数据集回滚后，OSv2 对象类型需手动重新索引（需替换 pipeline 成功运行）[RB]。
- 迁移时未映射到对象属性的 writeback 列会被丢弃 [MIG]。

## 8. 权限

- Project 是主要组织与自主权限边界；默认角色 Owner/Editor/Viewer/Discoverer；角色授权向子资源继承；推荐只在 Project 级授权，文件夹/文件级授权默认禁用（空间管理员可改默认，项目 Owner 可逐项目切换；禁用会移除既有的文件级授权和链接分享）[PR]。
- build 的输入输出必须在同一 Project；跨项目用 file reference（需源 Viewer + 目标 Editor）；同项目同事无需上游项目访问权即可看派生数据集，前提满足 markings/organization；要查看或基于原始上游数据集则仍需上游 Viewer [PR]。
- Markings [MK]：强制控制（角色是自主）；对资源上所有 marking 取 AND，要么全有要么没有；Project/文件夹的 marking 被其内所有文件继承；通过转换和分析沿数据依赖传播，限制上游即限制所有派生数据；用户可能看得到派生数据集及元数据但看不到数据；移除需 marking 上的 Expand Access 权限（Owner 也不行）；应用 marking 立即影响下游，可能锁定他人；marking 只限制不授予访问。
- 血缘传播细节 [RM][ACP]：marking 沿文件层级和直接依赖继承，"Markings always propagate"；给数据集或其所在文件夹加 marking 等于标记其整个事务历史；在 transform 中移除 marking 只对新事务生效，已有事务不变；增量数据集下游需在去标记 transform 后重建；`stop_propagating`/`stop_requiring` 配在输入上而非输出；推荐"filter in"写法；Restricted view 等自主过滤不沿血缘传播 [ACP]。
- 文件级 vs 数据集级：[ACP] 称 markings 适用于"datasets, transactions, files, and columns"，但页面未区分各自如何检查。

## 常见误解 / 坑

1. 以为数据集分支能合并：官方说不能 [BR]。合并的是代码，数据靠 master 重新 build。
2. 以为 DELETE 事务会物理删文件：不会，需保留策略 [DS][RET]。
3. UPDATE 事务覆盖旧文件会让所有下游增量转换退回 SNAPSHOT [DS][INC]。
4. 保留策略删除含增量依赖的数据可能让增量构建失败；增量转换需 `allow_retention=True` [RET]。
5. 回滚不改逻辑，不改代码则下次 build 又得到同样结果；且 OSv2 对象需手动重新索引 [RB]。
6. 多输出 job 不能只回滚/只构建一部分 [BD][RB]。
7. Schedule 的 Succeeded 只表示 build 已启动，不表示构建成功 [SCH]；Job status 检查对上游失败不评估 [CT]。
8. 在 marking 的数据集上"移除 marking"不对历史事务生效，不对称 [RM]。
9. Schema 与文件内容无强制一致性 [DS]。
10. 同名词多义：dataset view（事务回放结果）与 Data Integration 的 View（union 多个数据集的虚拟数据集）不同 [DS][VW]。
11. Health check 只告警不拦截；要阻止坏数据进入下游需用 FAIL 级 data expectation [CT][DEG]。
12. Data Health 的 "Sync status/Sync freshness" 指数据集向外部数据库同步，不是 Data Connection 入库 sync [CR]。
13. 改 check 名会丢失其历史 [DDE]；同一数据集同类型 health check 只能有一个 [RHC]。
14. 普通 retention 不沿血缘传播，Data Lifetime 会连带删除下游派生事务 [DLT]；Time Travel 看不到已被 retention 删除的版本 [TT]。
15. Projection 仅限 append-only 数据集，出现改写式事务会被自动禁用 [PROJ]。

## 未确认 / 官方文档里没查到

- Dataset RID 的格式与语义：[DS] 明确未覆盖，其它页面未读。
- Hive 分区页面：未读。Time Travel 页未提分支如何处理。
- Expectations 运行时机的精确定义：文档只写 "run as part of the build job"，没有说明是在输出事务提交前还是提交后执行。FAIL 时输出事务被 abort，是从 job aborted 加事务语义推断出来的，expectation 页面没有逐字写明。
- Expectations 在增量 transform 下是否按全量数据评估、lightweight transforms 的限制：只来自搜索摘要，已读正文未覆盖。
- Pipeline Builder expectations 是否有 WARN 级别：[PBDE] 只写失败即 build 失败。
- Data Connection 的 "integrated data health monitoring" [DC] 与 Data Health 应用如何对接、sync 是否自动带检查：未找到说明。monitoring rules reference 中的 "sync jobs failing" 规则只来自搜索摘要，未读原页（且摘要称其针对 object syncs）。
- Health check 严重级别措辞不一致：[CR] 写 Moderate/Critical，[PBHC] 写 Moderate/Severe。check evaluation 页面未读。
- `phonograph2-cache-worker` / `jdbc-worker` 这两种 sync destination 的确切含义：[CR] 没有解释。
- OSv2 中 Funnel 具体的增量索引机制、数据集变更到对象可见的延迟、reindex 触发条件：[OB] 未详述；"changelog"相关内容仅来自搜索摘要，未读 breaking-changes 页面。
- 文件级（单文件）访问与数据集级访问在读取 API 上的差异：未找到明确官方说明。
- scheduling-best-practices 内容、Data Lifetime policy override 细节：仅搜索摘要或未读。
- 若干页面（核心 dataset 页、restricted views、安全概述）在搜索结果中标注年龄超过 1000 天，可能不是最新行为。
- 方法局限：WebFetch 经小模型摘要，非逐字原文；引用为页面级，未做原文逐句核对。
