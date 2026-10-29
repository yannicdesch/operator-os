import type { Context } from './context.js'
import { REQUIRED_SECTIONS, SPEC_STATUSES, TASK_ORIGINS, TASK_STATUSES, type Spec } from './spec.js'
import { listItems, sections, stripComments } from './util.js'

export interface Issue {
  level: 'error' | 'warn'
  where: string
  message: string
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß ]/g, ' ').replace(/\s+/g, ' ').trim()
const fuzzyMatch = (a: string, b: string) => {
  const x = norm(a)
  const y = norm(b)
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x))
}

const isEmptyBody = (body: string) => {
  const text = stripComments(body).replace(/^#+.*$/gm, '').replace(/^\s*-\s*$/gm, '').trim()
  return text.length === 0
}

export function checkSpec(spec: Spec, ctx: Context): Issue[] {
  const issues: Issue[] = []
  const add = (level: Issue['level'], where: string, message: string) => issues.push({ level, where, message })

  // Structure
  if (!spec.meta.title) add('error', 'spec.md', 'Frontmatter has no title.')
  if (!SPEC_STATUSES.includes(spec.meta.status)) {
    add('error', 'spec.md', `Status "${spec.meta.status}" is not one of ${SPEC_STATUSES.join(', ')}.`)
  }
  const secs = sections(spec.body).filter(s => s.level === 2)
  for (const name of REQUIRED_SECTIONS) {
    const s = secs.find(x => x.heading.toLowerCase() === name.toLowerCase())
    const bodyWithSubs = s ? sectionWithChildren(spec.body, s.heading) : ''
    if (!s) add('error', `## ${name}`, 'Section is missing.')
    else if (isEmptyBody(bodyWithSubs) && name !== 'Open questions' && name !== 'Decisions') {
      add(spec.meta.status === 'draft' ? 'warn' : 'error', `## ${name}`, 'Section is still empty.')
    }
  }

  // Context links: the part a bare coding agent cannot check.
  if (!spec.meta.priority) {
    add('warn', 'priority', 'No priority set. Name the me.md priority this serves, or say in ## Context why it is worth doing anyway.')
  } else if (ctx.priorities.length && !ctx.priorities.some(p => fuzzyMatch(p, spec.meta.priority!))) {
    add('warn', 'priority', `"${spec.meta.priority}" is not a current priority in me.md (${ctx.priorities.join(' | ')}).`)
  }
  if (spec.meta.decision) {
    const open = ctx.openDecisions.some(d => fuzzyMatch(d.title, spec.meta.decision!))
    const closed = ctx.closedDecisions.some(d => fuzzyMatch(d, spec.meta.decision!))
    if (closed && !open) add('warn', 'decision', `"${spec.meta.decision}" is already closed in decisions.md. Do not reopen it without asking.`)
    else if (!open) add('warn', 'decision', `"${spec.meta.decision}" is not an open decision in decisions.md.`)
  }
  for (const name of spec.meta.stakeholders ?? []) {
    if (ctx.people.length && !ctx.people.some(p => fuzzyMatch(p.name, name))) {
      add('warn', 'stakeholders', `"${name}" is not in people.md, so agents cannot tailor anything to them.`)
    }
  }

  // Readiness
  const openQs = listItems(stripComments(sectionWithChildren(spec.body, 'Open questions')))
  if (['agreed', 'building'].includes(spec.meta.status) && openQs.length) {
    add('warn', '## Open questions', `Spec is ${spec.meta.status} with ${openQs.length} open question(s) left.`)
  }

  // Tasks
  const ids = new Set<string>()
  spec.tasks.forEach((t, i) => {
    const where = `tasks.yaml#${t.id ?? i + 1}`
    if (!t.id) add('error', where, 'Task has no id.')
    else if (ids.has(t.id)) add('error', where, `Duplicate task id "${t.id}".`)
    else ids.add(t.id)
    if (!t.title) add('error', where, 'Task has no title.')
    if (!TASK_STATUSES.includes(t.status)) add('error', where, `Status "${t.status}" is not one of ${TASK_STATUSES.join(', ')}.`)
    if (!TASK_ORIGINS.includes(t.origin)) add('error', where, `Origin "${t.origin}" is not one of ${TASK_ORIGINS.join(', ')}.`)
    if (t.origin === 'agreed' && !(t.checks ?? []).length) add('warn', where, 'Agreed task has no acceptance checks.')
    if (t.origin === 'proposed' && (t.status === 'doing' || t.status === 'done')) {
      add('warn', where, 'Proposed task is being built before anyone agreed to it.')
    }
  })
  const acceptance = listItems(stripComments(sectionWithChildren(spec.body, 'Acceptance')))
  if (acceptance.length && !spec.tasks.length) {
    add('warn', 'tasks.yaml', `## Acceptance lists ${acceptance.length} check(s) but tasks.yaml is empty.`)
  }
  return issues
}

function sectionWithChildren(body: string, heading: string): string {
  const lines = body.split('\n')
  const start = lines.findIndex(l => new RegExp(`^##\\s+${heading}\\s*$`, 'i').test(l))
  if (start < 0) return ''
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n')
}
