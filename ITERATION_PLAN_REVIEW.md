# TOKEN_SAVINGS_ITERATION_PLAN.md 评估报告

**评估日期**：2026-05-06
**被评估文档**：`TOKEN_SAVINGS_ITERATION_PLAN.md`
**评估者**：项目内部评审

---

## 1. 总体评价

计划建立在一个被 R2 验证的精准洞察之上：**现代模型天然使用 grep + range 阅读策略，重复全文件读取几乎不发生，因此重复读拦截对 token 节省贡献为零。** 计划的核心 pivot——从"拦截重复读取"转型为"干预大文件首次全量读"——方向正确，理由充分。

| 维度 | 评分 | 说明 |
|------|------|------|
| 问题诊断 | ⭐⭐⭐⭐⭐ | 核心洞察精准，有 R1/R2 数据支撑 |
| P0 设计 | ⭐⭐⭐⭐ | 方向对，strict 模式缺少 retry 机制 |
| P1 设计 | ⭐⭐⭐ | 目标正确，实现细节欠打磨 |
| P2 设计 | ⭐⭐⭐ | 实用但存在过度设计 |
| P3 设计 | ⭐⭐⭐⭐ | 正确但优先级应前移 |
| 可执行性 | ⭐⭐⭐ | 缺依赖关系图和迁移策略 |

---

## 2. 逐项评估

### 2.1 P0：大文件首次读守卫

**核心方向正确，设计细节有一个关键缺口。**

#### 正确的地方

- **阈值 8000 token 是合理的起点**。真实长窗口实验中，单个大源文件约 47k token，单次全量读即占基线侧总消费近一半。拦截这类读取的收益远超拦截几百 token 的重复读。
- **`warn` 模式作为默认是正确的**。对首次用户不应默认阻断，提示即可。`strict` 留给有明确需求的用户。
- **与现有 mode 体系一致**。插件已有 `strict`/`warn`/`adaptive` 三态，大文件策略复用同一套概念模型，学习成本低。

#### 需要修正的地方

**`strict` 模式缺少 retry 机制。** 现有的重复读拦截在 Error 消息中明确写了"Repeating the same read will bypass this check"，即 AI 可以选择无视。但大文件首次读如果永久禁止，会导致**某些需要全量理解整个文件的任务无法完成**。

**建议**：

```
strict 模式下的首次大文件读：
  第 1 次 → throw Error（附 section 提示）
  第 2 次 → 放行（用户/AI 明确坚持要读）
  
  此行为与现有 repeat-read 拦截保持一致。
```

#### 额外风险

- **阈值校准需要真实数据**。R1/R2 中哪些文件超过 8000 token？如果没有文件超过，P0 同样不会触发。建议先用真实项目的 anatomy.md 做一次分布分析。
- **`large_file_strict_allow_patterns`** 的定义不清晰。是 glob？正则？还是精确路径？

---

### 2.2 P1：Anatomy 作为读规划器

**这是整个计划中最有区分度的功能，但实现细节最碎。**

#### 正确的地方

- 将 `extractSections()` 的结果嵌入 anatomy，让大文件警告附带具体导航信息（"`initShapeTabControls()` at L120"），AI 可以直接跳到精确位置。这比泛泛的"请用 grep"有价值得多。
- 重用已有 `extractSections()` 是明智的，不引入新的复杂度。

#### 需要修正的地方

| 问题 | 说明 | 建议 |
|------|------|------|
| C++ 正则提取不可靠 | `extractSections()` 对 TS/Python/Go 表现好，对 C++ 的 template、macro、namespace 几乎无法解析。计划承认了但没给降级方案。 | 对非 TS/JS/Python 文件，至少提供 grep 友好的关键词（类名、函数名），哪怕不精确也行。 |
| 文件大小膨胀 | 47k token 的 C++ 文件可能有数百个函数，section 列表本身就会很大。 | 对 >30 个 sections 的文件只取前 15 个关键入口点（public API、main classes）。 |
| 更新时机不明 | 编辑文件后 section 缓存已通过 `fileSectionsCache.delete()` 清除，但 anatomy 的 section 列表没有对应的失效机制。 | 至少 `write`/`edit` 后标记该文件在 anatomy 中的 sections 为 stale。 |

---

### 2.3 P1：Better Telemetry for Savings

**必要，但存在过度设计。**

#### 正确的地方

- `full_reads` / `range_reads` 区分是当前最大痛点。R2 报告中需要手动从 OpenCode JSONL 里人工统计，太慢。
- `large_full_reads_warned` / `large_full_reads_blocked` 是 P0 的必要配套指标。

#### 需要修正的地方

- **`followed_by` 字段在插件层面无法获知**。插件无法知道 AI 在被警告后是否用了 grep 还是无视。这个字段应该在分析层（从 OpenCode JSONL）推断，而不是由插件填。
- **`estimated_tokens_avoided` 的计算公式不明确**。是 `full_file_tokens - actual_range_tokens`？还是跟 `baseline` 比？同一个 session 里不同文件的比较方式不同。

**建议**：P1 先做 `full_reads` / `range_reads` / `large_full_reads_warned` / `large_full_reads_blocked` 四个计数，`estimated_tokens_avoided` 和 `followed_by` 留到 P2 的 session-report。

---

### 2.4 P2：Session Report JSON

**实用，但建议简化而不是新增独立文件。**

当前 `memory.md` 已经是半结构化的 session 记录（纯文本 + 时间戳）。增设独立 `session-report.json` 增加了维护两个同类文件的负担。

**建议**：将 session 事件记录直接作为 `token-ledger.json` 中每个 session 条目的扩展字段：

```json
{
  "session_id": "ses_x",
  "reads": 11,
  "full_reads": 5,
  "range_reads": 6,
  "large_full_reads_warned": 2,
  "events": []
}
```

少一个文件就少一个维护负担，且与 `token-ledger.json` 的 session 粒度天然一致。

---

### 2.5 P2：REPOLENS Read Protocol

**最低成本、可能最高收益的改动。**

更新 `REPOLENS.md` 模板是纯文档改动，但效果可能显著：

- R2 证明了 DeepSeek 在没有提示时就用 grep + range。加上明确的读协议后，效果只会更好，不会更差。
- 这比 P0 的硬拦截更优雅：软性引导不打断工作流，不制造 frustration。

**建议**：把这个提到 P0 之前或与 P0 并行。它是免费的安全改进。

---

### 2.6 P3：Evaluation Harness for Real Savings

**这是整个计划的生死线，但被放在了最后。**

#### 问题

- 模拟器的 49% 数据在真实 R2 中表现为 0
- 没有可重复的真实 eval，所有 P0-P2 的改动都缺乏验证手段
- "Trap case" 设计——创造一个自然引诱全量读的任务——是核心

#### 建议

**P3 应该与 P0 并行推进，而非串行到最后。** 每实现一个改动，立刻用 trap case 跑 A/B 对比验证。否则可能投入大量工时完成 P0-P2，然后发现在真实模型下依然不触发。

---

## 3. 结构性问题

### 3.1 缺少依赖关系图

计划把 P0-P3 列为平级，但实际依赖关系是：

```
P0 (large-file guard) ──需要──▶ P1 (anatomy sections)
       │                              │
       └──────需要──▶ P1 (telemetry)  │
                      │               │
                      ▼               ▼
              P2 (session-report) ◀───┘
                      │
                      ▼
              P3 (real eval) ◀──应该与 P0 并行
```

### 3.2 warn vs strict 切换缺乏量化决策框架

计划说"Power users can switch to strict for aggressive savings"，但什么样的用户应该切换？什么证据表明 warn 不够？没有决策框架。

**建议**：增加一个升级路径说明——如果 warn 模式下 `large_full_reads_warned` 持续增长但 `full_reads` 不降，那就是时候切换到 strict。

### 3.3 缺少 LEDGER 迁移策略

新增字段会破坏旧 `.lens/` 目录的兼容性。计划在 "Risks" 中提了但没方案。

**建议**：

```typescript
const ledger = loadTokenLedger(projectDir)
ledger.lifetime.full_reads ??= 0
ledger.lifetime.range_reads ??= 0
// -> 自动兼容旧格式
```

### 3.4 缺少竞品对比

OpenWolf 的同类问题是如何解决的？计划提了一次 OpenWolf 但没说差距是什么。

---

## 4. 最关键的风险

> 即使 P0-P3 全部实现，如果真实模型仍然不触发大文件全量读，整个计划就只产出了更好的遥测和项目记忆——这些本身有价值，但无法证明 token 节省。

计划在 "Risks" 中提到了相关风险，但应对策略不足。

**建议在 P3 之前先回答**：在当前模型行为下，有没有一个文件是它一定会全量读的？如果有，从那个文件开始做 P0；如果没有，可能需要重新审视产品定位——RepoLens 的核心价值可能不是 token 节省，而是项目记忆和错误预防。

---

## 5. 修订建议的优先级

| 优先级 | 修订项 | 说明 |
|--------|--------|------|
| **立即** | P3 与 P0 并行 | 不做完 P0-P2 才验证，每步都验证 |
| **立即** | P0 strict 增加 retry 机制 | 防止永久阻断 |
| **高** | 画依赖关系图 | 让团队对齐执行顺序 |
| **高** | 明确 LEDGER 迁移策略 | 向后兼容是底线 |
| **中** | 简化 session-report 为 ledger 扩展 | 减少文件数 |
| **中** | 先做文件大小分布分析 | 验证阈值 8000 在真实项目中是否触达 |
| **低** | 补充竞品对比 | 增强说服力 |

---

## 6. 结论

计划的核心 pivot 是正确且必要的。从"拦截重复读"到"干预大文件首次全量读"的转型反映了两次真实 A/B 测试的诚实反馈。计划的非目标声明也同样成熟：不虚报百分比、不引入外部依赖、不强制默认严格模式。

**修正上述问题后，这份计划可以作为 RepoLens v1.1 的开发路线图。** 关键风险（真实模型不触发触发条件）需要 P3 尽早验证，如果失败，产品定位应转向项目记忆与行为护栏，而非 token 节省。
