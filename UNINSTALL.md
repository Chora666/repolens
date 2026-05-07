# RepoLens 卸载指南

## 快速定位要删除的文件

RepoLens 的所有文件都在以下三个位置，全部在项目根目录内：

```
你的项目/
├── .opencode/plugins/repolens.ts    ← 插件代码
├── REPOLENS.md                      ← AI 行为指南
└── .lens/                              ← 所有数据文件
    ├── config.json
    ├── anatomy.md
    ├── cerebrum.md
    ├── buglog.json
    ├── memory.md
    ├── session-briefing.md
    └── token-ledger.json
```

RepoLens 不会写任何东西到上面之外的位置。没有全局配置、没有 npm 全局包、没有环境变量残留。

## 一键精准卸载

在项目根目录执行：

```bash
rm -rf .lens/ REPOLENS.md .opencode/plugins/repolens.ts
```

## 分步卸载（只删其中一部分）

```bash
rm .opencode/plugins/repolens.ts    # 只移除插件，保留所有数据
rm -rf .lens/                           # 只删除数据文件
rm REPOLENS.md                       # 只删除 AI 指南
```

## 验证已完全卸载

以下三个路径都不存在即表示已完全卸载：

```bash
ls .opencode/plugins/repolens.ts   # 应报 No such file
ls .lens/                              # 应报 No such file
ls REPOLENS.md                      # 应报 No such file
```

## 重新安装

直接放回文件即可：

1. 把 `repolens.ts` 放回 `.opencode/plugins/`
2. 重启 OpenCode
