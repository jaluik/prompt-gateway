# Developing Prompt Gateway

这个文档面向仓库维护者，记录本地开发、测试、发版和提交约束。

## 环境要求

- Node.js `18` 或更高版本
- pnpm `10.33.2`，由 `package.json` 的 `packageManager` 字段固定

建议通过 Corepack 使用仓库声明的 pnpm 版本：

```bash
corepack enable
corepack prepare pnpm@10.33.2 --activate
```

仓库通过 `pnpm-workspace.yaml` 显式允许 `esbuild` 的安装脚本，避免 pnpm 10 在全新安装时提示未审查的依赖 build script。

安装依赖：

```bash
pnpm install
```

## 本地开发

构建整个项目：

```bash
pnpm build
```

运行 CLI：

```bash
node dist/cli.js
```

启动前端开发服务器：

```bash
pnpm dev:web
```

## 常用命令

```bash
pnpm format
pnpm check
pnpm test
pnpm build
pnpm pack:dry
```

## 发版流程

发版由 GitHub Actions 自动完成，当前使用 npm Trusted Publishing，不依赖 `NPM_TOKEN`。

提交到 `master` 时会自动执行：

- `pnpm check`
- `pnpm test`

推送形如 `v*` 的 tag 时会执行完整发布流程：

- `pnpm check`
- `pnpm test`
- `pnpm build`
- `pnpm pack:dry`
- 校验 tag 版本和 `package.json` 中的 `version` 一致
- 通过 Trusted Publishing 发布到 npm

推荐发布步骤：

1. 更新 `package.json` 中的 `version`
2. 提交代码并推送到 `master`
3. 创建并推送对应 tag，例如：

```bash
git tag v0.0.1
git push origin v0.0.1
```

注意事项：

- tag 必须和 `package.json` 版本一致，例如 `0.0.1` 对应 `v0.0.1`
- 如果 GitHub Actions 的 release job 失败，npm 不会发布成功
- 发版前建议确认 `master` 最近一次 CI 已通过
- 当前发布依赖 npm 包设置里的 Trusted Publisher 配置，且 workflow 文件名必须是 `ci-cd.yml`

## 提交约束

- `pre-commit`: 通过 `lint-staged` 对暂存文件执行 `biome check --write`
- `commit-msg`: 通过 `commitlint` 校验 Conventional Commits

首次安装依赖后会通过 `husky` 自动启用 Git hooks。
