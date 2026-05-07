export interface SimCall {
  label: string
  tool: "Read" | "Write" | "Edit" | "Bash"
  args: Record<string, unknown>
  retry_if_blocked?: boolean
}

export interface Scenario {
  name: string
  description: string
  calls: SimCall[]
  expectedBlocks: number
  expectedCerebrum: number
  fixtureConfig?: string
}

export const scenarios: Scenario[] = [
  {
    name: "1. 重复全文件读取",
    description: "同一文件连续读 3 次，第 2、3 次应被拦截",
    calls: [
      { label: "first read", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "second read (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "third read (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
    ],
    expectedBlocks: 2,
    expectedCerebrum: 0,
  },
  {
    name: "2. 多文件无重复",
    description: "读 3 个不同文件，全部放行",
    calls: [
      { label: "read api", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read auth", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "read utils", tool: "Read", args: { filePath: "src/utils.ts" } },
    ],
    expectedBlocks: 0,
    expectedCerebrum: 0,
  },
  {
    name: "3. 范围读取绕过",
    description: "第 2 次用 offset/limit 应放行，第 3 次全量读拦截",
    calls: [
      { label: "first read", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "range read (allowed)", tool: "Read", args: { filePath: "src/api.ts", offset: 50, limit: 30 } },
      { label: "full read #3 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
    ],
    expectedBlocks: 1,
    expectedCerebrum: 0,
  },
  {
    name: "4. 写后重读清缓存",
    description: "写文件后读历史清空，后续重读重新计数",
    calls: [
      { label: "read #1", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "write (clears history)", tool: "Write", args: { filePath: "src/api.ts" } },
      { label: "read #1 (new)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read #2 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "edit (clears history)", tool: "Edit", args: { filePath: "src/api.ts" } },
      { label: "read #1 (new again)", tool: "Read", args: { filePath: "src/api.ts" } },
    ],
    expectedBlocks: 2,
    expectedCerebrum: 1,
  },
  {
    name: "5. cerebrum 写入警告",
    description: "cerebrum 匹配时抛 Error，重试放行",
    calls: [
      { label: "write api (blocked)", tool: "Write", args: { filePath: "src/api.ts" } },
      { label: "write api retry (allowed)", tool: "Write", args: { filePath: "src/api.ts" } },
    ],
    expectedBlocks: 1,
    expectedCerebrum: 1,
  },
  {
    name: "6. 混合重负载",
    description: "30 次调用含 8 次重复全量读、5 次写、3 次 bash",
    calls: [
      // 8 repeated reads of api.ts + auth.ts
      { label: "read api #1", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read auth #1", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "read utils", tool: "Read", args: { filePath: "src/utils.ts" } },
      { label: "read api #2 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read auth #2 (blocked)", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "read api #3 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read auth #3 (blocked)", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "read api #4 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read auth #4 (blocked)", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "read api #5 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read api #6 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      // 5 writes
      { label: "write api", tool: "Write", args: { filePath: "src/api.ts" } },
      { label: "write auth", tool: "Write", args: { filePath: "src/auth.ts" } },
      { label: "edit api", tool: "Edit", args: { filePath: "src/api.ts" } },
      { label: "edit auth", tool: "Edit", args: { filePath: "src/auth.ts" } },
      { label: "write utils", tool: "Write", args: { filePath: "src/utils.ts" } },
      // 3 bash
      { label: "bash test", tool: "Bash", args: { command: "npm test" } },
      { label: "bash lint", tool: "Bash", args: { command: "npm run lint" } },
      { label: "bash build", tool: "Bash", args: { command: "npm run build" } },
      // 11 more reads (mix)
      { label: "read utils #2 (blocked)", tool: "Read", args: { filePath: "src/utils.ts" } },
      { label: "read utils #3 (blocked)", tool: "Read", args: { filePath: "src/utils.ts" } },
      { label: "read api (after write)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read auth (after write)", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "read api #2 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read api #3 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read auth #2 (blocked)", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "read auth #3 (blocked)", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "read utils (after write)", tool: "Read", args: { filePath: "src/utils.ts" } },
      { label: "read utils #2 (blocked)", tool: "Read", args: { filePath: "src/utils.ts" } },
      { label: "read utils #3 (blocked)", tool: "Read", args: { filePath: "src/utils.ts" } },
    ],
    expectedBlocks: 17,
    expectedCerebrum: 1,
  },
  {
    name: "7. 混合轻负载",
    description: "15 次调用含 2 次重复、3 次写",
    calls: [
      { label: "read api", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read auth", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "read api #2 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read api #3 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "write api", tool: "Write", args: { filePath: "src/api.ts" } },
      { label: "edit auth", tool: "Edit", args: { filePath: "src/auth.ts" } },
      { label: "read api (after write)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read auth (after edit)", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "read api #2 (blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read auth #2 (blocked)", tool: "Read", args: { filePath: "src/auth.ts" } },
      { label: "write utils", tool: "Write", args: { filePath: "src/utils.ts" } },
      { label: "read utils (after write)", tool: "Read", args: { filePath: "src/utils.ts" } },
      { label: "read utils #2 (blocked)", tool: "Read", args: { filePath: "src/utils.ts" } },
      { label: "read utils #3 (blocked)", tool: "Read", args: { filePath: "src/utils.ts" } },
      { label: "bash test", tool: "Bash", args: { command: "npm test" } },
    ],
    expectedBlocks: 7,
    expectedCerebrum: 1,
  },
  {
    name: "8. config.enabled = false",
    description: "插件禁用时所有读放行，无拦截",
    fixtureConfig: "config-disabled.json",
    calls: [
      { label: "read api", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read api again", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read api third", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "write api", tool: "Write", args: { filePath: "src/api.ts" } },
    ],
    expectedBlocks: 0,
    expectedCerebrum: 0,
  },
  {
    name: "9. mode = warn (non-blocking)",
    description: "mode=warn 时重复读只 console.warn，不抛 Error",
    fixtureConfig: "config-warn.json",
    calls: [
      { label: "read api", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read api #2 (not blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
      { label: "read api #3 (not blocked)", tool: "Read", args: { filePath: "src/api.ts" } },
    ],
    expectedBlocks: 0,
    expectedCerebrum: 0,
  },
]
