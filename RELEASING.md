# Release flow / 发版流程

> 中文版：[RELEASING.zh-CN.md](RELEASING.zh-CN.md)

For maintainers. Three rules first:

1. **Zero dependencies is non-negotiable.** `dependencies` must stay empty; anything there blocks the release.
2. **Run the self-tests before every release** and paste the raw output into the release notes (not "it passes").
3. **Tag first, then publish.** Reversed order leaves npm with a version GitHub has no tag for.

## 1. Choosing a version

| Change | Version |
|---|---|
| Bug fix, wording, styling | patch (0.1.0 → 0.1.1) |
| New skill / new flag / new output form | minor (0.1.0 → 0.2.0) |
| Breaking CLI flags or output filenames | major (during 0.x, use minor and mark BREAKING in CHANGELOG) |

## 2. Pre-release checks

```bash
node -e "const p=require('./package.json'); if(Object.keys(p.dependencies||{}).length) {console.error('dependencies are not empty, blocking'); process.exit(1)}; console.log('zero deps OK')"

npm run smoke     # twelve suites, 484 assertions
npm run doctor    # render-capability diagnosis (needs a browser)

npm pack --dry-run
```

Read the `npm pack --dry-run` output yourself: **no** `out/`, `node_modules/`, local config, session files, or scratch scripts.

## 3. Update the docs

- `CHANGELOG.md` + `CHANGELOG.zh-CN.md`: new version section in both, with Added / Changed / Fixed / known-limit changes — never update only one.
- `README.md` + `README.zh-CN.md`: keep them in sync when behaviour changes — never update only one.
- `skills/<id>/SKILL.md`: the skill body is the single source of truth; do not keep a copy.

## 4. Commit and tag

```bash
git add -A
git commit -m "chore(release): v0.x.y"
git tag -a v0.x.y -m "v0.x.y"
git push origin main
git push origin v0.x.y
```

Pushing the tag triggers `.github/workflows/publish.yml`.

## 5. Publishing to npm — via Trusted Publishing, no token

This repository publishes with **npm Trusted Publishing (OIDC)**. No `NPM_TOKEN`, no secret in the repository; npm accepts a short-lived credential minted from the GitHub OIDC token.

One-time setup, only needed once per package:

1. **Publish the first version by hand.** Trusted publishing binds to an existing package, so 0.1.0 goes up manually:

   ```bash
   npm login
   npm publish --access public
   ```

2. **Attach the trusted publisher.** npmjs.com → the package → Settings → Trusted publisher → GitHub Actions:

   | Field | Value |
   |---|---|
   | Organization or user | `7starsseeker` |
   | Repository | `dsh-card-export` |
   | Workflow filename | `publish.yml` |
   | Environment | *(empty)* |

3. **From then on, the tag does it.** `git push origin v0.x.y` → the workflow runs the self-tests, verifies tag == `package.json` version, and publishes with a provenance attestation.

After publishing, verify:

```bash
npm view dsh-card-export version dist.tarball
npm view dsh-card-export --json | grep -i provenance
```

If the workflow fails with `ENEEDAUTH`, either the trusted publisher is not attached yet or the package does not exist (first publish still pending). If it fails on npm version, the workflow's `npm install -g npm@latest` step did not take — trusted publishing needs npm ≥ 11.5.1.

## 6. GitHub Release

Create the release from the tag, with the matching `CHANGELOG.md` section plus the raw self-test output.

## 7. Plugin marketplace

The marketplace shows a plugin differently depending on how it is declared:

| Declaration | Card | Update path |
|---|---|---|
| `dsh plugin add dsh-card-export` (registry semver) | normal installed card | npm: publish + `dsh plugin update` |
| `dsh plugin add <local path>` (yields `link:`) | **local dev** | edits take effect on restart, no release |

The test is whether the dependency matches `^(?:link|file):`, not whether you are "still developing" — switch `link:` to an npm version to enter the normal update channel.

Submission itself is one YAML file in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin): `data/plugins/<owner>__<repo>.yml`. Requirements: `package.json` must declare `dsh.bundle` (not just `dsh.client`), and only `description.en` is mandatory.

## 8. Rollback

Published npm versions cannot be overwritten (`npm unpublish` is limited to 72 hours and discouraged). Roll back by **shipping a higher version** and stating the reason in `CHANGELOG.md`.
