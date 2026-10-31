import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run, parseArgs } from '../dist/cli.js'
import { loadContext, parseDecisions, parsePeople, parsePriorities } from '../dist/context.js'
import { checkSpec } from '../dist/check.js'
import { loadSpec } from '../dist/spec.js'
import { globToRegExp } from '../dist/util.js'

const silent = fn => {
  const orig = console.log
  const lines = []
  console.log = (...a) => lines.push(a.join(' '))
  try {
    return { code: fn(), out: lines.join('\n') }
  } finally {
    console.log = orig
  }
}

function project() {
  const root = mkdtempSync(join(tmpdir(), 'bearing-'))
  const sh = (...a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' })
  sh('init', '-q')
  sh('config', 'user.email', 't@example.com')
  sh('config', 'user.name', 'Test')
  writeFileSync(join(root, 'README.md'), 'x\n')
  sh('add', '.')
  sh('commit', '-qm', 'init')
  silent(() => run(['init'], root))
  writeFileSync(join(root, '.operator-os/me.md'), '# me.md\n## Current quarter priorities\n1. Cut onboarding time in half\n2. [Priority 2]\n')
  writeFileSync(
    join(root, '.operator-os/decisions.md'),
    '# decisions.md\n## Open decisions\n### Build or buy saved filters?\n- **Deciding by:** 2026-11-15\n- **My current lean:** build\n### [Decision 2]\n## Recently closed\n- Dropped the legacy export API. 2026-10-01.\n',
  )
  writeFileSync(join(root, '.operator-os/people.md'), '# people.md\n## Team\n### Anna Berg — Lead Engineer\n### [Name] — [Role]\n')
  return root
}

test('parseArgs handles repeats, inline values and booleans', () => {
  const a = parseArgs(['spec', 'new', 'Title', '--stakeholder', 'A', '--stakeholder=B', '--all'])
  assert.deepEqual(a._, ['spec', 'new', 'Title'])
  assert.deepEqual(a.flags.stakeholder, ['A', 'B'])
  assert.deepEqual(a.flags.all, ['true'])
})

test('context parsers ignore template placeholders', () => {
  assert.deepEqual(parsePriorities('## Current quarter priorities\n1. Real one\n2. [Priority 2]\n'), ['Real one'])
  const d = parseDecisions('## Open decisions\n### [Decision 1 — name it]\n### Hire a PM?\n- **My current lean:** yes\n## Recently closed\n- Closed thing\n')
  assert.equal(d.openDecisions.length, 1)
  assert.equal(d.openDecisions[0].lean, 'yes')
  assert.deepEqual(d.closedDecisions, ['Closed thing'])
  assert.deepEqual(parsePeople('### [Name] — [Role]\n### Anna — CTO\n'), [{ name: 'Anna', role: 'CTO' }])
})

test('globs', () => {
  assert.ok(globToRegExp('src/**').test('src/a/b.ts'))
  assert.ok(globToRegExp('src/**/*.ts').test('src/x.ts'))
  assert.ok(!globToRegExp('src/*.ts').test('src/a/b.ts'))
})

test('init scaffolds context, config and agent workflows', () => {
  const root = mkdtempSync(join(tmpdir(), 'bearing-'))
  mkdirSync(join(root, '.claude'))
  const { code } = silent(() => run(['init'], root))
  assert.equal(code, 0)
  for (const f of ['me.md', 'company.md', 'style.md', 'decisions.md', 'people.md']) {
    assert.ok(existsSync(join(root, '.operator-os', f)), f)
  }
  assert.ok(existsSync(join(root, 'bearing.config.json')))
  const skill = readFileSync(join(root, '.claude/skills/bearing-spec/SKILL.md'), 'utf8')
  assert.match(skill, /^---\nname: bearing-spec\ndescription: "/)
  assert.match(skill, /bearing context/)
})

test('spec check links the spec to the operator context', () => {
  const root = project()
  silent(() => run(['spec', 'new', 'Saved filters', '--priority', 'Ship to pilots', '--decision', 'legacy export API', '--stakeholder', 'Bob'], root))
  const ctx = loadContext(root)
  const issues = checkSpec(loadSpec(root, 'saved-filters'), ctx)
  const by = w => issues.find(i => i.where === w)?.message ?? ''
  assert.match(by('priority'), /not a current priority/)
  assert.match(by('decision'), /already closed/)
  assert.match(by('stakeholders'), /"Bob" is not in people.md/)
  assert.ok(!issues.some(i => i.level === 'error'), 'a fresh draft has warnings, not errors')
})

test('spec check errors once a non-draft spec is empty', () => {
  const root = project()
  silent(() => run(['spec', 'new', 'Saved filters', '--priority', 'onboarding time'], root))
  const path = join(root, 'specs/saved-filters/spec.md')
  writeFileSync(path, readFileSync(path, 'utf8').replace('status: draft', 'status: agreed'))
  const { code, out } = silent(() => run(['spec', 'check', 'saved-filters'], root))
  assert.equal(code, 1)
  assert.match(out, /## Problem: Section is still empty/)
  assert.doesNotMatch(out, /priority:/)
})

test('reconcile separates proof, pending decisions and drift', () => {
  const root = project()
  silent(() => run(['spec', 'new', 'Saved filters', '--priority', 'onboarding time'], root))
  silent(() => run(['task', 'add', 'saved-filters', 'Persist filters', '--files', 'src/filters/**', '--check', 'survives reload'], root))
  silent(() => run(['task', 'add', 'saved-filters', 'Share filters', '--origin', 'proposed'], root))
  mkdirSync(join(root, 'src/filters'), { recursive: true })
  writeFileSync(join(root, 'src/filters/store.ts'), 'a')
  writeFileSync(join(root, 'src/unrelated.ts'), 'b')
  silent(() => run(['task', 'set', 'saved-filters', 'T1', '--status', 'done'], root))

  let r = silent(() => run(['reconcile', 'saved-filters', '--git-diff', '--json', '--strict'], root))
  let report = JSON.parse(r.out)
  assert.equal(r.code, 1)
  assert.deepEqual(report.proofPending.map(t => t.id), ['T1'])
  assert.deepEqual(report.awaitingDecision.map(t => t.id), ['T2'])
  assert.deepEqual(report.drift, ['src/unrelated.ts'], 'bearing files and claimed files are not drift')

  silent(() => run(['task', 'set', 'saved-filters', 'T1', '--evidence', 'test:npm test -- filters'], root))
  silent(() => run(['task', 'set', 'saved-filters', 'T2', '--status', 'dropped'], root))
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-qm', 'wip'], { cwd: root })
  r = silent(() => run(['reconcile', 'saved-filters', '--git-diff', '--json', '--strict'], root))
  report = JSON.parse(r.out)
  assert.equal(r.code, 0)
  assert.deepEqual(report.proven.map(t => t.id), ['T1'])
  assert.deepEqual(report.drift, [])

  const events = readFileSync(join(root, 'specs/saved-filters/events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.equal(events[0].type, 'spec.created')
  assert.equal(events.filter(e => e.type === 'reconcile.run').length, 2)
})

test('codex setup keeps the rest of AGENTS.md intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'bearing-'))
  writeFileSync(join(root, 'AGENTS.md'), '# House rules\n\nUse tabs.\n')
  silent(() => run(['setup', 'codex'], root))
  silent(() => run(['setup', 'codex'], root))
  const md = readFileSync(join(root, 'AGENTS.md'), 'utf8')
  assert.match(md, /^# House rules\n\nUse tabs\./)
  assert.equal(md.match(/bearing:start/g).length, 1)
  assert.ok(existsSync(join(root, '.bearing/skills/spec.md')))
})

test('init honours an absolute contextDir outside the project', () => {
  const root = mkdtempSync(join(tmpdir(), 'bearing-'))
  const ctxDir = mkdtempSync(join(tmpdir(), 'bearing-ctx-'))
  writeFileSync(join(ctxDir, 'me.md'), '# me.md\n## Current quarter priorities\n1. Mine\n')
  writeFileSync(join(root, 'bearing.config.json'), JSON.stringify({ contextDir: ctxDir, specsDir: 'specs' }))
  silent(() => run(['init'], root))
  assert.equal(readFileSync(join(ctxDir, 'me.md'), 'utf8'), '# me.md\n## Current quarter priorities\n1. Mine\n', 'existing file kept')
  assert.ok(existsSync(join(ctxDir, 'decisions.md')), 'missing files created in the configured dir')
  assert.ok(!existsSync(join(root, ctxDir.replace(/^\//, ''))), 'nothing created inside the project')
})
