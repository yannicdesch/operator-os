import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

export function stripComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

// "[Your title]" style placeholders left over from the templates.
export function countPlaceholders(md: string): number {
  return (stripComments(md).match(/\[[^\]\n]{2,60}\]/g) ?? []).length
}

export interface Section {
  heading: string
  level: number
  body: string
}

export function sections(md: string): Section[] {
  const out: Section[] = []
  let current: Section | null = null
  for (const line of md.split('\n')) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    if (m) {
      if (current) out.push(current)
      current = { heading: m[2].trim(), level: m[1].length, body: '' }
    } else if (current) {
      current.body += line + '\n'
    }
  }
  if (current) out.push(current)
  return out.map(s => ({ ...s, body: s.body.trim() }))
}

export function listItems(body: string): string[] {
  return body
    .split('\n')
    .map(l => /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(l)?.[1]?.trim())
    .filter((l): l is string => !!l)
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

// Minimal glob: `**` spans directories, `*` and `?` stay inside one segment.
export function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*'
      i++
      if (glob[i + 1] === '/') i++
    } else if (c === '*') {
      re += '[^/]*'
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${re}$`)
}

export function matchesAny(file: string, globs: string[]): boolean {
  return globs.some(g => globToRegExp(g).test(file))
}

export function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
