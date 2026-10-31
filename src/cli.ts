#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkSpec } from './check.js'
import {
  CONFIG_FILE,
  CONTEXT_FILES,
  STALE_AFTER_DAYS,
  brief,
  contextHealth,
  loadConfig,
  loadContext,
  readTemplate,
} from './context.js'
import { formatReport, reconcile } from './reconcile.js'
import { AGENTS, detectAgents, setupAgent, type Agent } from './setup.js'
import {
  TASK_ORIGINS,
  TASK_STATUSES,
  appendEvent,
  createSpec,
  listSpecs,
  loadSpec,
  saveTasks,
  specsRoot,
  type Evidence,
  type Task,
} from './spec.js'
import { PACKAGE_ROOT, git } from './util.js'

const VERSION = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version as string

interface Args {
  _: string[]
  flags: Record<string, string[]>
}

export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [key, inline] = a.slice(2).split(/=(.*)/s)
      const next = argv[i + 1]
      const value = inline ?? (next !== undefined && !next.startsWith('--') ? (i++, next) : 'true')
      ;(out.flags[key] ??= []).push(value)
    } else {
      out._.push(a)
    }
  }
  return out
}

const flag = (a: Args, k: string) => a.flags[k]?.at(-1)
const has = (a: Args, k: string) => k in a.flags

class UsageError extends Error {}

const HELP = `Bearing ${VERSION}: keeps your coding agent on course, using your Operator OS context

Main workflows
  bearing init                       Set up Operator OS in this project and suggest a first move
  bearing doctor                     Check node, git, context files and agent setup
  bearing context                    Print your context (me, company, style, decisions, people)
  bearing spec new "<title>"         Create a spec tied to a priority and an open decision
  bearing spec check <slug>          Validate a spec against its structure and your context
  bearing reconcile <slug> --git-diff
                                     Compare what was built with what was agreed

In your coding agent (after \`bearing setup claude\`), ask for a workflow by name:
  /bearing-interview-me  /bearing-spec  /bearing-roast
  /bearing-pitch  /bearing-build  /bearing-reconcile

Run \`bearing help --all\` for every command.`

const HELP_ALL = `${HELP}

All commands
  bearing init [--context <dir>] [--agent claude|cursor|codex]
  bearing doctor
  bearing setup <claude|cursor|codex>
  bearing context [--json]
  bearing status
  bearing spec new "<title>" [--slug s] [--priority p] [--decision d] [--owner o] [--stakeholder name]...
  bearing spec list
  bearing spec show <slug>
  bearing spec check <slug> | --all
  bearing task add <slug> "<title>" [--origin agreed|proposed|discovered] [--files "glob,glob"] [--check "..."]...
  bearing task set <slug> <id> [--status todo|doing|done|dropped] [--evidence type:ref]...
  bearing event <slug> <type> [--note "..."]
  bearing reconcile <slug> [--git-diff] [--base <ref>] [--json] [--strict]

Workflows for your agent: interview-me, spec, roast, pitch, ideate, research, discovery, preview, build, reconcile.`

export function run(argv: string[], root = process.cwd()): number {
  const args = parseArgs(argv)
  const [cmd, sub, ...rest] = args._
  const log = (s = '') => console.log(s)

  if (has(args, 'version') && !cmd) {
    log(VERSION)
    return 0
  }

  switch (cmd) {
    case undefined:
    case 'help':
      log(has(args, 'all') ? HELP_ALL : HELP)
      return 0

    case 'version':
      log(VERSION)
      return 0

    case 'doctor':
      return doctor(root, log)

    case 'init':
      return init(root, args, log)

    case 'setup': {
      const agent = sub as Agent
      if (!AGENTS.includes(agent)) throw new UsageError(`Usage: bearing setup <${AGENTS.join('|')}>`)
      const files = setupAgent(root, agent)
      log(`Installed ${files.length} file(s) for ${agent}:`)
      files.forEach(f => log(`  ${f}`))
      return 0
    }

    case 'context': {
      const ctx = loadContext(root)
      if (!Object.keys(ctx.files).length) {
        log(`No context files in ${relative(root, ctx.dir) || '.'}. Run \`bearing init\` first.`)
        return 1
      }
      if (has(args, 'json')) {
        log(JSON.stringify({ priorities: ctx.priorities, openDecisions: ctx.openDecisions, closedDecisions: ctx.closedDecisions, people: ctx.people }, null, 2))
      } else {
        log(brief(ctx))
      }
      return 0
    }

    case 'status':
      return status(root, log)

    case 'spec':
      return spec(root, sub, rest, args, log)

    case 'task':
      return task(root, sub, rest, args, log)

    case 'event': {
      if (!sub || !rest[0]) throw new UsageError('Usage: bearing event <slug> <type> [--note "..."]')
      const s = loadSpec(root, sub)
      appendEvent(s.dir, rest[0], flag(args, 'note') ? { note: flag(args, 'note') } : {}, 'agent')
      if (rest[0] === 'spec.agreed' || rest[0] === 'spec.done') log(`Logged ${rest[0]}. Remember to set status in spec.md.`)
      else log(`Logged ${rest[0]}.`)
      return 0
    }

    case 'reconcile': {
      if (!sub) throw new UsageError('Usage: bearing reconcile <slug> [--git-diff] [--base <ref>] [--json] [--strict]')
      const s = loadSpec(root, sub)
      const report = reconcile(root, s, { gitDiff: has(args, 'git-diff') || has(args, 'base'), base: flag(args, 'base') })
      log(has(args, 'json') ? JSON.stringify(report, null, 2) : formatReport(report))
      const needsPerson = report.drift.length + report.proofPending.length + report.awaitingDecision.length > 0
      return has(args, 'strict') && needsPerson ? 1 : 0
    }

    default:
      throw new UsageError(`Unknown command "${cmd}". Run \`bearing help\`.`)
  }
}

function doctor(root: string, log: (s?: string) => void): number {
  let problems = 0
  const line = (ok: boolean | 'warn', text: string) => {
    if (ok === false) problems++
    log(`${ok === true ? 'ok  ' : ok === 'warn' ? 'warn' : 'FAIL'}  ${text}`)
  }
  const major = Number(process.versions.node.split('.')[0])
  line(major >= 18, `node ${process.versions.node} (need 18+)`)
  line(git(['--version'], root) !== null, 'git available')
  line(git(['rev-parse', '--is-inside-work-tree'], root) === 'true' ? true : 'warn', 'inside a git repository (reconcile --git-diff needs one)')
  line(existsSync(join(root, CONFIG_FILE)) ? true : 'warn', `${CONFIG_FILE} present`)

  const ctx = loadContext(root)
  for (const h of contextHealth(ctx)) {
    if (!h.present) line(false, `${h.file} missing in ${relative(root, ctx.dir) || '.'}`)
    else if (h.placeholders > 0) line('warn', `${h.file} still has ${h.placeholders} template placeholder(s)`)
    else if (h.ageDays !== null && h.ageDays > STALE_AFTER_DAYS[h.file]) line('warn', `${h.file} last changed ${h.ageDays} days ago`)
    else line(true, h.file)
  }
  line(ctx.priorities.length > 0 ? true : 'warn', `${ctx.priorities.length} priorities in me.md`)
  line(ctx.openDecisions.length > 0 ? true : 'warn', `${ctx.openDecisions.length} open decisions in decisions.md`)

  const agents = detectAgents(root)
  const installed = [
    existsSync(join(root, '.claude', 'skills', 'bearing-spec')) && 'claude',
    existsSync(join(root, '.cursor', 'rules', 'bearing-spec.mdc')) && 'cursor',
    existsSync(join(root, '.bearing', 'skills', 'spec.md')) && 'codex',
  ].filter(Boolean)
  line(installed.length ? true : 'warn', installed.length ? `agent workflows installed: ${installed.join(', ')}` : `no agent workflows installed${agents.length ? ` (found ${agents.join(', ')}: run \`bearing setup ${agents[0]}\`)` : ''}`)
  log()
  log(problems ? `${problems} problem(s). Fix them, then run \`bearing doctor\` again.` : 'Ready.')
  return problems ? 1 : 0
}

function init(root: string, args: Args, log: (s?: string) => void): number {
  const configPath = join(root, CONFIG_FILE)
  const existing = loadConfig(root)
  const contextDir = flag(args, 'context') ?? existing.contextDir
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({ contextDir, specsDir: existing.specsDir }, null, 2) + '\n')
    log(`Wrote ${CONFIG_FILE} (context in ${contextDir})`)
  }
  const ctxDir = resolve(root, contextDir)
  mkdirSync(ctxDir, { recursive: true })
  for (const f of CONTEXT_FILES) {
    const p = join(ctxDir, f)
    if (!existsSync(p)) {
      writeFileSync(p, readTemplate(f, PACKAGE_ROOT))
      log(`Created ${relative(root, p)}`)
    }
  }
  mkdirSync(specsRoot(root), { recursive: true })

  const agents = flag(args, 'agent') ? [flag(args, 'agent') as Agent] : detectAgents(root)
  for (const a of agents) {
    if (!AGENTS.includes(a)) throw new UsageError(`Unknown agent "${a}". Use one of ${AGENTS.join(', ')}.`)
    log(`Installed ${setupAgent(root, a).length} ${a} workflow file(s)`)
  }
  if (!agents.length) log('No coding agent detected. Run `bearing setup claude|cursor|codex` when you have one.')

  log()
  log(firstMove(root))
  return 0
}

export function firstMove(root: string): string {
  const ctx = loadContext(root)
  const health = contextHealth(ctx)
  const unfilled = health.filter(h => h.present && h.placeholders > 0).map(h => h.file)
  const specs = listSpecs(root)
  if (unfilled.includes('me.md')) {
    return 'First move: fill in me.md (20 minutes: role, what you own, this quarter\'s priorities). Every workflow reads it.'
  }
  if (unfilled.includes('decisions.md')) {
    return 'First move: write your two most pressing open decisions into decisions.md. Specs and pitches will tie into them.'
  }
  if (!specs.length) {
    const p = ctx.priorities[0]
    return `First move: ask your agent for /bearing-spec on something small that serves "${p ?? 'your top priority'}", or run:\n  bearing spec new "<title>"${p ? ` --priority "${p}"` : ''}`
  }
  return `First move: you have ${specs.length} spec(s). Run \`bearing status\` to see where each one stands.`
}

function status(root: string, log: (s?: string) => void): number {
  const slugs = listSpecs(root)
  if (!slugs.length) {
    log('No specs yet. ' + firstMove(root))
    return 0
  }
  for (const slug of slugs) {
    const s = loadSpec(root, slug)
    const count = (f: (t: Task) => boolean) => s.tasks.filter(f).length
    const live = s.tasks.filter(t => t.status !== 'dropped')
    log(`${slug.padEnd(32)} ${String(s.meta.status).padEnd(9)} ${count(t => t.status === 'done')}/${live.length} done` +
      `${count(t => t.status === 'done' && !(t.evidence ?? []).length) ? `, ${count(t => t.status === 'done' && !(t.evidence ?? []).length)} without proof` : ''}` +
      `${count(t => t.origin === 'proposed' && t.status === 'todo') ? `, ${count(t => t.origin === 'proposed' && t.status === 'todo')} awaiting decision` : ''}` +
      `${s.meta.priority ? `  · ${s.meta.priority}` : ''}`)
  }
  return 0
}

function spec(root: string, sub: string | undefined, rest: string[], args: Args, log: (s?: string) => void): number {
  switch (sub) {
    case 'new': {
      const title = rest[0]
      if (!title) throw new UsageError('Usage: bearing spec new "<title>" [--priority p] [--decision d] [--stakeholder name]...')
      const ctx = loadContext(root)
      const dir = createSpec(root, ctx, {
        title,
        slug: flag(args, 'slug'),
        priority: flag(args, 'priority'),
        decision: flag(args, 'decision'),
        owner: flag(args, 'owner'),
        stakeholders: args.flags.stakeholder,
      })
      log(`Created ${relative(root, dir)}/ (spec.md, tasks.yaml, events.jsonl)`)
      const issues = checkSpec(loadSpec(root, dir), ctx).filter(i => i.where === 'priority' || i.where === 'decision' || i.where === 'stakeholders')
      issues.forEach(i => log(`${i.level}  ${i.message}`))
      return 0
    }
    case 'list':
      listSpecs(root).forEach(s => log(s))
      return 0
    case 'show': {
      if (!rest[0]) throw new UsageError('Usage: bearing spec show <slug>')
      const s = loadSpec(root, rest[0])
      log(readFileSync(join(s.dir, 'spec.md'), 'utf8'))
      log('--- tasks.yaml ---')
      log(readFileSync(join(s.dir, 'tasks.yaml'), 'utf8'))
      return 0
    }
    case 'check': {
      const slugs = has(args, 'all') ? listSpecs(root) : rest[0] ? [rest[0]] : []
      if (!slugs.length) throw new UsageError('Usage: bearing spec check <slug> | --all')
      const ctx = loadContext(root)
      let errors = 0
      for (const slug of slugs) {
        const issues = checkSpec(loadSpec(root, slug), ctx)
        errors += issues.filter(i => i.level === 'error').length
        log(`${slug}: ${issues.length ? `${issues.filter(i => i.level === 'error').length} error(s), ${issues.filter(i => i.level === 'warn').length} warning(s)` : 'clean'}`)
        issues.forEach(i => log(`  ${i.level === 'error' ? 'error' : 'warn '}  ${i.where}: ${i.message}`))
      }
      return errors ? 1 : 0
    }
    default:
      throw new UsageError('Usage: bearing spec <new|list|show|check>')
  }
}

function task(root: string, sub: string | undefined, rest: string[], args: Args, log: (s?: string) => void): number {
  const [slug, arg] = rest
  if (!slug || !arg) throw new UsageError('Usage: bearing task add <slug> "<title>" | bearing task set <slug> <id> ...')
  const s = loadSpec(root, slug)

  if (sub === 'add') {
    const origin = (flag(args, 'origin') ?? 'agreed') as Task['origin']
    if (!TASK_ORIGINS.includes(origin)) throw new UsageError(`--origin must be one of ${TASK_ORIGINS.join(', ')}`)
    const next = 1 + Math.max(0, ...s.tasks.map(t => Number(/^T(\d+)$/.exec(t.id)?.[1] ?? 0)))
    const t: Task = { id: `T${next}`, title: arg, status: 'todo', origin }
    const files = flag(args, 'files')
    if (files) t.files = files.split(',').map(f => f.trim()).filter(Boolean)
    if (args.flags.check) t.checks = args.flags.check
    s.tasks.push(t)
    saveTasks(s)
    appendEvent(s.dir, 'task.added', { id: t.id, origin }, 'agent')
    log(`Added ${t.id} (${origin}): ${t.title}`)
    return 0
  }

  if (sub === 'set') {
    const t = s.tasks.find(x => x.id === arg)
    if (!t) throw new UsageError(`No task "${arg}" in ${slug}.`)
    const st = flag(args, 'status') as Task['status'] | undefined
    if (st) {
      if (!TASK_STATUSES.includes(st)) throw new UsageError(`--status must be one of ${TASK_STATUSES.join(', ')}`)
      t.status = st
    }
    for (const e of args.flags.evidence ?? []) {
      const [type, ...ref] = e.split(':')
      if (!['test', 'file', 'commit', 'note'].includes(type) || !ref.length) {
        throw new UsageError('--evidence must look like test:"npm test", file:path, commit:sha or note:text')
      }
      ;(t.evidence ??= []).push({ type: type as Evidence['type'], ref: ref.join(':') })
    }
    saveTasks(s)
    appendEvent(s.dir, 'task.updated', { id: t.id, status: t.status, evidence: args.flags.evidence ?? [] }, 'agent')
    log(`${t.id}: ${t.status}${t.status === 'done' && !(t.evidence ?? []).length ? ' (proof pending: add --evidence)' : ''}`)
    return 0
  }
  throw new UsageError('Usage: bearing task <add|set> ...')
}

// Global installs run through a symlink in the npm bin directory.
const isMain = !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    process.exitCode = run(process.argv.slice(2))
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = e instanceof UsageError ? 2 : 1
  }
}
