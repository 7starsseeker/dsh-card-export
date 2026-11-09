# 发版流程

面向维护者。三条原则先写在前面：

1. **零依赖不许破**：`dependencies` 必须保持为空，`package.json` 里出现任何依赖都算阻断项。
2. **发版前必须跑自检**，并把原始输出贴进 release notes（不要写"跑过了"）。
3. **先 tag 后 publish**，顺序反了会造成 npm 上有版本、GitHub 上没有对应 tag。

## 1. 版本号怎么定

| 变更 | 版本 |
|---|---|
| 修 bug、改文案、调样式 | patch（0.1.0 → 0.1.1） |
| 新增技能 / 新增参数 / 新增输出形态 | minor（0.1.0 → 0.2.0） |
| 破坏既有 CLI 参数或输出文件命名 | major（0.x 阶段按 minor 处理并在 CHANGELOG 标注 BREAKING） |

## 2. 发版前检查

```bash
node -e "const p=require('./package.json'); if(Object.keys(p.dependencies||{}).length) {console.error('依赖不为空，阻断发版'); process.exit(1)}; console.log('零依赖 OK')"

npm run smoke     # 八组自检
npm run doctor    # 渲染能力诊断（需要浏览器）

npm pack --dry-run   # 看会被发布哪些文件
```

`npm pack --dry-run` 的输出要人工过一遍：**不能出现** `out/`、`node_modules/`、本机配置、会话文件、临时脚本。

## 3. 更新文档

- `CHANGELOG.md`：新增版本小节，写清 Added / Changed / Fixed / 已知边界变化。
- `README.md` + `README.en.md`：行为变了就同步，两份不能只改一份。
- 对应 `skills/<id>/SKILL.md`：技能正文是唯一来源，不要另存副本。

## 4. 提交与打 tag

```bash
git add -A
git commit -m "chore(release): v0.x.y"
git tag -a v0.x.y -m "v0.x.y"
git push origin main --follow-tags
```

## 5. 发布到 npm

```bash
npm publish --access public
```

`package.json` 里已声明 `publishConfig.access = public` 与官方 registry。

发布后核对：

```bash
npm view dsh-card-export version dist.tarball
```

## 6. GitHub Release

用 tag 生成 release，正文贴 `CHANGELOG.md` 对应小节 + 自检原始输出。

## 7. 插件市场

市场按插件来源区分展示：

| 声明形式 | 市场显示 | 更新机制 |
|---|---|---|
| `dsh plugin add dsh-card-export`（registry 语义版本） | 普通已安装卡片 | 走 npm，需发版 + `dsh plugin update` |
| `dsh plugin add <本地路径>`（生成 `link:` 声明） | **本地开发** | 改源码重启即生效，不发版 |

判断依据是依赖声明是否匹配 `^(?:link|file):`，与是否"开发中"无关——想进入正常更新通道，就把 `link:` 换成 npm 版本号。

## 8. 回滚

npm 的已发布版本不可覆盖（`npm unpublish` 有 72 小时限制且不推荐）。回滚方式是**发一个更高版本的修复**，并在 CHANGELOG 写明撤回原因。
