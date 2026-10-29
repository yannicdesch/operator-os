import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { countPlaceholders, git, listItems, readIfExists, sections, stripComments } from './util.js'

export const CONTEXT_FILES = ['me.md', 'company.md', 'style.md', 'decisions.md', 'people.md'] as const
export type ContextFile = (typeof CONTEXT_FILES)[number]

export const CONFIG_FILE = 'polaris.config.json'

export interface Config {
  contextDir: string
  specsDir: string
}

const DEFAULTS: Config = { contextDir: '.operator-os', specsDir: 'specs' }

export function loadConfig(root: string): Config {
  const raw = readIfExists(join(root, CONFIG_FILE))
  if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  // A fork of the template keeps the five files at the repo root.
  if (existsSync(join(root, 'me.md'))) return { ...DEFAULTS, contextDir: '.' }
  return DEFAULTS
}

export interface OpenDecision {
  title: string
  decidingBy: string | null
  lean: string | null
}

export interface Person {
  name: string
  role: string
}

export interface Context {
  dir: string
  files: Partial<Record<ContextFile, string>>
  priorities: string[]
  openDecisions: OpenDecision[]
  closedDecisions: string[]
  people: Person[]
}

export function loadContext(root: string, config = loadConfig(root)): Context {
  const dir = resolve(root, config.contextDir)
  const files: Context['files'] = {}
  for (const f of CONTEXT_FILES) {
    const raw = readIfExists(join(dir, f))
    if (raw !== null) files[f] = raw
  }
  return {
    dir,
    files,
    priorities: parsePriorities(files['me.md'] ?? ''),
    ...parseDecisions(files['decisions.md'] ?? ''),
    people: parsePeople(files['people.md'] ?? ''),
  }
}

const isPlaceholder = (s: string) => /^\[.*\]$/.test(s.trim()) || s.trim() === ''

export function parsePriorities(me: string): string[] {
  const s = sections(stripComments(me)).find(x => /priorit/i.test(x.heading))
  return s ? listItems(s.body).filter(p => !isPlaceholder(p)) : []
}

export function parseDecisions(md: string): { openDecisions: OpenDecision[]; closedDecisions: string[] } {
  const all = sections(stripComments(md))
  const openDecisions: OpenDecision[] = []
  let inOpen = false
  let closedDecisions: string[] = []
  for (const s of all) {
    if (s.level === 2) {
      inOpen = /open/i.test(s.heading)
      if (/closed/i.test(s.heading)) closedDecisions = listItems(s.body).filter(d => !isPlaceholder(d))
      continue
    }
    if (inOpen && s.level === 3 && !isPlaceholder(s.heading)) {
      const field = (name: string) => {
        const m = new RegExp(`\\*\\*${name}:\\*\\*\\s*(.*)`, 'i').exec(s.body)
        const v = m?.[1]?.trim()
        return v && !isPlaceholder(v) ? v : null
      }
      openDecisions.push({ title: s.heading, decidingBy: field('Deciding by'), lean: field('My current lean') })
    }
  }
  return { openDecisions, closedDecisions }
}

export function parsePeople(md: string): Person[] {
  return sections(stripComments(md))
    .filter(s => s.level === 3)
    .map(s => {
      const [name, ...rest] = s.heading.split(/\s+[—-]\s+/)
      return { name: name.trim(), role: rest.join(' — ').trim() }
    })
    .filter(p => !isPlaceholder(p.name))
}

export interface FileHealth {
  file: ContextFile
  present: boolean
  placeholders: number
  ageDays: number | null
}

// Age comes from the last commit touching the file, else its mtime.
export function contextHealth(ctx: Context): FileHealth[] {
  return CONTEXT_FILES.map(file => {
    const raw = ctx.files[file]
    if (raw === undefined) return { file, present: false, placeholders: 0, ageDays: null }
    const path = join(ctx.dir, file)
    const committed = git(['log', '-1', '--format=%ct', '--', file], ctx.dir)
    const ts = committed ? Number(committed) * 1000 : statSync(path).mtimeMs
    return {
      file,
      present: true,
      placeholders: countPlaceholders(raw),
      ageDays: Math.floor((Date.now() - ts) / 86_400_000),
    }
  })
}

// decisions.md goes stale in a week, the rest in a quarter (see README).
export const STALE_AFTER_DAYS: Record<ContextFile, number> = {
  'decisions.md': 7,
  'me.md': 90,
  'company.md': 90,
  'people.md': 90,
  'style.md': 365,
}

export function brief(ctx: Context): string {
  const parts = CONTEXT_FILES.filter(f => ctx.files[f]).map(f => `<!-- ${f} -->\n${stripComments(ctx.files[f]!)}`)
  return parts.join('\n\n---\n\n')
}

export function readTemplate(file: ContextFile, packageRoot: string): string {
  return readFileSync(join(packageRoot, 'templates', file), 'utf8')
}
