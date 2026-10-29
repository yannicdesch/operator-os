import { join, relative } from 'node:path'
import { CONFIG_FILE, loadConfig } from './context.js'
import { appendEvent, type Spec, type Task } from './spec.js'
import { git, matchesAny } from './util.js'

export interface ReconcileOptions {
  gitDiff: boolean
  base?: string
}

export interface ReconcileReport {
  spec: string
  proven: Task[]
  proofPending: Task[]
  inProgress: Task[]
  notStarted: Task[]
  awaitingDecision: Task[]
  discovered: Task[]
  drift: string[]
  changedFiles: string[]
  base: string | null
}

export function changedFiles(root: string, base?: string): string[] | null {
  if (git(['rev-parse', '--is-inside-work-tree'], root) !== 'true') return null
  const files = new Set<string>()
  const add = (out: string | null) => out?.split('\n').filter(Boolean).forEach(f => files.add(f))
  if (base) add(git(['diff', '--name-only', `${base}...HEAD`], root))
  add(git(['diff', '--name-only', 'HEAD'], root))
  add(git(['ls-files', '--others', '--exclude-standard'], root))
  return [...files].sort()
}

// Files polaris itself writes: specs, context, config and installed workflows are never drift.
function polarisOwned(root: string): string[] {
  const cfg = loadConfig(root)
  const dir = (p: string) => (p === '.' ? null : `${relative(root, join(root, p)).replace(/\\/g, '/')}/**`)
  return [
    dir(cfg.specsDir),
    dir(cfg.contextDir),
    ...(cfg.contextDir === '.' ? ['me.md', 'company.md', 'style.md', 'decisions.md', 'people.md'] : []),
    CONFIG_FILE,
    '.polaris/**',
    '.claude/skills/polaris-*/**',
    '.cursor/rules/polaris-*.mdc',
    'AGENTS.md',
  ].filter((g): g is string => !!g)
}

export function reconcile(root: string, spec: Spec, opts: ReconcileOptions): ReconcileReport {
  const live = spec.tasks.filter(t => t.status !== 'dropped')
  const report: ReconcileReport = {
    spec: spec.slug,
    proven: live.filter(t => t.status === 'done' && (t.evidence ?? []).length > 0),
    proofPending: live.filter(t => t.status === 'done' && !(t.evidence ?? []).length),
    inProgress: live.filter(t => t.status === 'doing'),
    notStarted: live.filter(t => t.status === 'todo' && t.origin !== 'proposed'),
    awaitingDecision: live.filter(t => t.origin === 'proposed' && t.status === 'todo'),
    discovered: live.filter(t => t.origin === 'discovered'),
    drift: [],
    changedFiles: [],
    base: opts.base ?? null,
  }

  if (opts.gitDiff) {
    const files = changedFiles(root, opts.base)
    if (files === null) throw new Error('--git-diff needs a git repository.')
    const claimed = live.flatMap(t => t.files ?? [])
    report.changedFiles = files.filter(f => !matchesAny(f, polarisOwned(root)))
    report.drift = report.changedFiles.filter(f => !matchesAny(f, claimed))
  }

  appendEvent(spec.dir, 'reconcile.run', {
    proven: report.proven.map(t => t.id),
    proof_pending: report.proofPending.map(t => t.id),
    awaiting_decision: report.awaitingDecision.map(t => t.id),
    drift: report.drift,
    base: report.base,
  })
  return report
}

export function formatReport(r: ReconcileReport): string {
  const list = (tasks: Task[]) => tasks.map(t => `  ${t.id}  ${t.title}`).join('\n')
  const out: string[] = [`Reconcile: ${r.spec}${r.base ? ` (against ${r.base})` : ''}`, '']
  const block = (title: string, body: string) => body && out.push(`${title}\n${body}\n`)

  block('Proven (done, with evidence)', list(r.proven))
  block('Done, proof pending: marked done without evidence', list(r.proofPending))
  block('In progress', list(r.inProgress))
  block('Not started', list(r.notStarted))
  block('Waiting for your decision (proposed, not agreed)', list(r.awaitingDecision))
  block('Discovered while building: check these belong in scope', list(r.discovered))
  block('Drift: changed files no task claims', r.drift.map(f => `  ${f}`).join('\n'))

  const verdict =
    r.drift.length || r.proofPending.length || r.awaitingDecision.length
      ? 'Needs a person: resolve drift, add evidence or make the pending calls before approving.'
      : r.inProgress.length || r.notStarted.length
        ? 'Consistent so far. Work is still open.'
        : 'Everything agreed is done and backed by evidence. Ready for approval.'
  out.push(verdict)
  return out.join('\n')
}
