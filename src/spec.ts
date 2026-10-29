import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import YAML from 'yaml'
import { loadConfig, type Context } from './context.js'
import { sections, slugify, today } from './util.js'

export const SPEC_STATUSES = ['draft', 'agreed', 'building', 'done', 'parked'] as const
export const TASK_STATUSES = ['todo', 'doing', 'done', 'dropped'] as const
// agreed: part of the spec you signed off. proposed: waits for your call.
// discovered: necessary work the agent found while building.
export const TASK_ORIGINS = ['agreed', 'proposed', 'discovered'] as const

export const REQUIRED_SECTIONS = ['Problem', 'Context', 'Scope', 'Decisions', 'Open questions', 'Acceptance'] as const

export interface Evidence {
  type: 'test' | 'file' | 'commit' | 'note'
  ref: string
}

export interface Task {
  id: string
  title: string
  status: (typeof TASK_STATUSES)[number]
  origin: (typeof TASK_ORIGINS)[number]
  files?: string[]
  checks?: string[]
  evidence?: Evidence[]
}

export interface SpecMeta {
  title: string
  status: (typeof SPEC_STATUSES)[number]
  priority?: string
  decision?: string
  owner?: string
  stakeholders?: string[]
  created?: string
}

export interface Spec {
  slug: string
  dir: string
  meta: SpecMeta
  body: string
  tasks: Task[]
}

export function specsRoot(root: string): string {
  return resolve(root, loadConfig(root).specsDir)
}

export function listSpecs(root: string): string[] {
  const dir = specsRoot(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(dir, d.name, 'spec.md')))
    .map(d => d.name)
    .sort()
}

export function resolveSpecDir(root: string, ref: string): string {
  const direct = resolve(root, ref)
  if (existsSync(join(direct, 'spec.md'))) return direct
  const bySlug = join(specsRoot(root), ref)
  if (existsSync(join(bySlug, 'spec.md'))) return bySlug
  throw new Error(`No spec found at "${ref}". Run \`bearing spec list\` to see what exists.`)
}

export function parseFrontmatter(md: string): { meta: Record<string, unknown>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md)
  if (!m) return { meta: {}, body: md }
  return { meta: (YAML.parse(m[1]) as Record<string, unknown>) ?? {}, body: m[2] }
}

export function loadSpec(root: string, ref: string): Spec {
  const dir = resolveSpecDir(root, ref)
  const { meta, body } = parseFrontmatter(readFileSync(join(dir, 'spec.md'), 'utf8'))
  const tasksPath = join(dir, 'tasks.yaml')
  const tasksDoc = existsSync(tasksPath) ? (YAML.parse(readFileSync(tasksPath, 'utf8')) as { tasks?: Task[] }) : null
  return {
    slug: dir.split(/[\\/]/).pop()!,
    dir,
    meta: meta as unknown as SpecMeta,
    body,
    tasks: tasksDoc?.tasks ?? [],
  }
}

export function saveTasks(spec: Spec): void {
  writeFileSync(join(spec.dir, 'tasks.yaml'), TASKS_HEADER + YAML.stringify({ tasks: spec.tasks }))
}

export interface BearingEvent {
  ts: string
  type: string
  by: string
  [key: string]: unknown
}

export function appendEvent(dir: string, type: string, data: Record<string, unknown> = {}, by = 'bearing'): BearingEvent {
  const event: BearingEvent = { ts: new Date().toISOString(), type, by, ...data }
  appendFileSync(join(dir, 'events.jsonl'), JSON.stringify(event) + '\n')
  return event
}

export function readEvents(dir: string): BearingEvent[] {
  const path = join(dir, 'events.jsonl')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as BearingEvent)
}

export function specSections(spec: Spec): string[] {
  return sections(spec.body)
    .filter(s => s.level === 2)
    .map(s => s.heading)
}

const TASKS_HEADER = `# status: todo | doing | done | dropped
# origin: agreed (in the spec you signed off) | proposed (waits for your call) | discovered (found while building)
# files: globs this task is allowed to touch; reconcile flags changes no task claims
# evidence: proof that a check passed, e.g. { type: test, ref: "npm test -- filters" }
`

export interface NewSpecInput {
  title: string
  slug?: string
  priority?: string
  decision?: string
  owner?: string
  stakeholders?: string[]
}

export function createSpec(root: string, ctx: Context, input: NewSpecInput): string {
  const slug = input.slug ?? slugify(input.title)
  const dir = join(specsRoot(root), slug)
  if (existsSync(join(dir, 'spec.md'))) throw new Error(`Spec "${slug}" already exists at ${dir}`)
  mkdirSync(dir, { recursive: true })

  const meta: SpecMeta = {
    title: input.title,
    status: 'draft',
    priority: input.priority ?? '',
    decision: input.decision ?? '',
    owner: input.owner ?? '',
    stakeholders: input.stakeholders ?? [],
    created: today(),
  }
  const hints = [
    ctx.priorities.length ? `Priorities in me.md: ${ctx.priorities.map(p => `"${p}"`).join(', ')}` : null,
    ctx.openDecisions.length ? `Open decisions in decisions.md: ${ctx.openDecisions.map(d => `"${d.title}"`).join(', ')}` : null,
    ctx.people.length ? `People in people.md: ${ctx.people.map(p => p.name).join(', ')}` : null,
  ].filter(Boolean)

  writeFileSync(join(dir, 'spec.md'), `---\n${YAML.stringify(meta)}---\n\n${specBody(hints as string[])}`)
  writeFileSync(join(dir, 'tasks.yaml'), TASKS_HEADER + YAML.stringify({ tasks: [] }))
  writeFileSync(join(dir, 'events.jsonl'), '')
  appendEvent(dir, 'spec.created', { title: input.title })
  return dir
}

function specBody(hints: string[]): string {
  const ctx = hints.length ? `<!--\n${hints.join('\n')}\n-->\n\n` : ''
  return `## Problem

<!-- Who has the problem, what it costs them today, and how you know. Evidence beats opinion. -->

## Context

${ctx}<!-- Which priority in me.md this serves, which open decision in decisions.md it feeds,
what company.md says that constrains it. If it serves no priority, say why it is still worth doing. -->

## Scope

### In

-

### Out

-

## Decisions

<!-- Settled calls, one line each, with the reason. Agents never reopen these without asking. -->

## Open questions

<!-- Only the questions that change the work. Name who can answer each (see people.md). -->

## Acceptance

<!-- Checks a reviewer can run or observe. Each one maps to a task in tasks.yaml. -->
`
}
