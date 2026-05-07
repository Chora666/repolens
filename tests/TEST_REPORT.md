# RepoLens 量化测试报告

**日期**：2026-05-06
**版本**：@chora404/repolens v1.0.0
**测试方式**：模拟器，9 个场景 × 独立子进程（tsx）

补充：真实 OpenCode CLI/Desktop smoke test 已记录在 `tests/REAL_OPENCODE_SMOKE.md`。本报告的节省比例仍来自模拟器估算，用于判断机制上限和保守区间，不等同于真实账单降幅。

---

## 测试架构

```
tests/
├── run.ts          # 入口：逐场景起子进程，收集 JSON，输出报告
├── harness.ts      # 插件驱动：session.created → before → after → session.idle
├── scenarios.ts    # 9 个场景定义（共 69 次工具调用）
├── reporter.ts     # 双口径汇总表格
└── fixtures/
    ├── src/
    │   ├── api.ts   (~621 tok)
    │   ├── auth.ts  (~303 tok)
    │   └── utils.ts (~207 tok)
    └── .lens/
        ├── config.json
        ├── config-disabled.json  # enabled: false 变体
        ├── config-warn.json      # mode: warn 变体
        ├── cerebrum.md           # 预置 Do-Not-Repeat 条目
        └── token-ledger.json
```

## 测试场景

### 场景 1：重复全文件读取
3 次 `read src/api.ts` — 第 2、3 次被拦截。

### 场景 2：多文件无重复
3 个不同文件各读一次 — 全部放行。

### 场景 3：范围读取绕过
第 2 次带 offset/limit 放行，第 3 次全量读拦截。

### 场景 4：写后重读清缓存
写 api.ts 后读历史清零，后续重读重新计数。cerebrum 条目触发 1 次写入警告。

### 场景 5：Cerebrum 写入警告
写 api.ts → cerebrum throw Error → retry 放行。per-file 一次警告。

### 场景 6：混合重负载
30 次调用（20 read + 5 write + 2 edit + 3 bash）。

### 场景 7：混合轻负载
15 次调用（10 read + 2 write + 1 edit + 2 bash）。

### 场景 8：config.enabled = false
4 次 read/write — 插件禁用，全部放行，0 拦截。

### 场景 9：mode = warn (non-blocking)
3 次重复读 — console.warn 提示但不阻断，0 拦截，记录到 stderr。

## 量化结果

```
════════════════════════════════════════════════════════════════════════════════════════
                    RepoLens Quantification Report
════════════════════════════════════════════════════════════════════════════════════════

Scenario               Calls  Blocked  Warned  Baseline(tok)  Saved(opt)  Opt%  Saved(cons)  Cons%
────────────────────────────────────────────────────────────────────────────────────────
1. 重复全文件读取                 3        2       0            621         414   67%           331    53%
2. 多文件无重复                  3        0       0            510           0    0%             0     0%
3. 范围读取绕过                  3        1       0            621         207   33%           165    27%
4. 写后重读清缓存                 6        2       1            828         207   25%           165    20%
5. cerebrum 写入警告              2        1       1              0           0     —             0      —
6. 混合重负载                   30       17       1           3879        2859   74%          2287    59%
7. 混合轻负载                   15        7       1           1944        1029   53%           823    42%
8. config.enabled = false        4        0       0            621           0    0%             0     0%
9. mode = warn (non-blocking)     3        0       0            621           0    0%             0     0%
────────────────────────────────────────────────────────────────────────────────────────
TOTAL                           69       30       4           9645        4716   49%          3771  39%
════════════════════════════════════════════════════════════════════════════════════════
```

## 关键指标

| 指标 | 数值 |
|------|------|
| 总工具调用数 | 69 |
| 被拦截的调用 | 30 (43%) |
| —— 其中重复读取拦截 | 26 |
| —— 其中 Cerebrum 写入警告 | 4 |
| 基线 token（全放行） | 9,645 |
| 乐观节省（AI 跳过） | 4,716 (49%) |
| 保守节省（grep / 20% 代价） | 3,771 (39%) |
| Token 账本一致性 | 9/9 ✓（reads / writes / tokens / repeated blocks 精确匹配） |
| 模式验证 | strict / warn / disabled 已覆盖 |

## 估算方式

- Token 使用 `文件字节数 / 4`（与插件 `token_estimation_ratio` 一致）
- **乐观**：AI 被拦截后完全不读
- **保守**：AI 被拦截后改用 grep/offset，按原文件 20% token 估算
- 实际节省取决于 AI 是否遵循插件建议

## 已知问题

1. Token 估算为字符计数近似，非真实 tokenizer
2. 模拟器不包含 AI 的实际行为反馈回路
3. Cerebrum 匹配为精确路径，同文件名跨目录不互认

## 用当前代码生成报告

```bash
npm test
```

报告由 `tests/run.ts` + `tests/reporter.ts` 自动生成。
