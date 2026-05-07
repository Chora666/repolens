# Trap-Case Real Eval 结果报告

**日期**：2026-05-06  
**模型**：dee-seek/deepseek-v4-pro  
**测试文件**：`audio-engine-full.ts`（18,475 bytes ≈ 4,619 tokens）  
**配置**：`large_file_threshold_tokens: 3000`

---

## 结果对比

| 指标 | A (disabled) | B (strict) | C (warn) |
|------|:---:|:---:|:---:|
| 模型行为 | 全量读 + 修复 | **被拦截** → grep + range | 全量读（无视警告） |
| 全量读取 | 1 | **0** (被拦截) | 1 |
| Range 读取 | 0 | **2+** | 0 |
| grep 调用 | 0 | **2+** | 0 |
| 大文件阻止 | — | **1** | 0 |
| 大文件警告 | — | 0 | **1** |
| Ledger 记录 | — | ✅ blocked | ✅ warned |

---

## 详细行为

### A (disabled — 基线)
```
→ Read audio-engine-full.ts           # 全量读 4619 tokens
← Edit audio-engine-full.ts           # 修复 triangle wave bug
```
模型直接读全文件，找出并修复了 triangle wave 计算错误。

### B (strict — 大文件守卫生效)
```
✗ read failed                         # ★ 被拦截！
  Error: [RepoLens] Large file read: src/audio-engine-full.ts (~4619 tok, threshold 3000)
  
✱ grep "class Oscillator"            # 改用 grep
✱ grep "triangle|Triangle"           # 精准搜索
→ Read audio-engine-full.ts [offset=40, limit=160]  # Range read 绕过
→ Read audio-engine.ts [limit=200]                    # 读小文件
✱ Glob "**/*.test.*"                 # 继续探索
```

**关键**：被拦截后模型立即改变策略，用 grep + range read 替代了全量读。严格模式成功干预了模型的大文件读取行为。

### C (warn — 警告被无视)
```
→ Read audio-engine-full.ts           # 仍全量读 4619 tokens
                                      # console.warn 发出但不阻断
```
模型看到了警告但直接忽略，仍然是全量读。

---

## 关键发现

### 1. strict 模式有效——且模型响应良好

第一次大文件读被阻止后，模型自动切换到 grep + range read 策略。没有 loop 在同一错误上，没有 task failure。这与 R2 中 DeepSeek 的"天然倾向 grep+range"一致——模型不需要 hard block 也会选择廉价路径。

### 2. warn 模式无效

警告被完全无视。对 DeepSeek 来说，`console.warn` 不被模型看到，等同于 off。

### 3. 量化估算

| 场景 | 估算 token | 节省 vs A |
|------|-----------|----------|
| A 全量读 | 4,619 | — |
| B grep+range | ~800 (估) | ~83% |
| C 全量读 | 4,619 | 0% |

---

## 结论

**P0 大文件守卫（strict 模式）在真实 OpenCode + DeepSeek 环境中验证有效。** 

- 1 次触发，1 次成功干预
- 模型响应良好，自动切换到 grep + range
- 保守节省约 83% 的该文件读取 token

**warn 模式不改变行为**，建议未来版本默认 strict 或提供更显眼的警告（如 throw Error 但不阻止 retry）。

---

## 建议

1. **提高默认阈值到 8000**（当前项目 plugin.ts ~8.8k token 会触发，大部分正常文件不受影响）
2. **默认 large_file_policy 改为 strict**（warn 无效，off 太保守）
3. **清理模板 config.json**，让其包含 large_file_policy 和 threshold，避免 init --force 覆盖定制配置

---

## 运行方式

```bash
# 重置并运行 trap-case
rm -rf /tmp/pl-trap-b
cp -r tests/fixtures/trap-case /tmp/pl-trap-b
cd /tmp/pl-trap-b
node bin/cli.js init --force
cp .lens/config-strict.json .lens/config.json
opencode run --dir /tmp/pl-trap-b -m dee-seek/deepseek-v4-pro "Find bug in src/audio-engine-full.ts" --dangerously-skip-permissions
```
