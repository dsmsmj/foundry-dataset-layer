# Foundry 数据集层 Glossary

本工作区的统一术语。只收学习者已能正确使用的词。

## 事务与视图

**事务（Transaction）**：
对数据集内容的一次原子改动，类似 Git 的一次提交；状态为 OPEN、COMMITTED 或 ABORTED，只有 COMMITTED 的事务影响视图。
_Avoid_：提交记录、版本

**视图（View）**：
数据集在某个分支、某个时间点上实际有效的文件集合；从该时间点之前最近的已提交 SNAPSHOT 起，依次回放已提交的事务得到。
_Avoid_：当前数据、最新版本（不说清分支和时间点就有歧义）。注意：Data Integration 里的大写产品 "View" 是另一个概念。

**SNAPSHOT**：
用一组全新文件整体替换视图的事务。
_Avoid_：全量覆盖（可以用作口头理解，但旧事务和旧文件都还在）

**APPEND**：
只向视图加入新文件、不改已有文件的事务。
_Avoid_：增量（"增量"留给后面课程里的增量构建）

**UPDATE**：
向视图加入新文件，并可覆盖已有文件内容（A → A′）的事务。
_Avoid_：定点更新（它也能加新文件）

## 分支

**分支（Branch）**：
指向某条线上最新事务的指针，本身不存数据；删除分支只删指针，事务保留。数据集分支不能合并。
_Avoid_：数据副本、环境

## 质量检查

**Data Expectation**：
写在 transform 代码里、挂在输入（pre-condition）或输出（post-condition）上的检查，在构建 Job 运行期间执行；FAIL（默认）中止 Job，WARN 放行并告警。
_Avoid_：上游检查、schema 校验（它能检查的不止 schema）

**Data Health 检查**：
配置在数据集或调度上的监控，多数在 Job 结束后计算，只告警、不拦数据。
_Avoid_：数据校验（容易和 Expectation 混）
