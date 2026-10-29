import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './spec.js'
import { PACKAGE_ROOT } from './util.js'

export const AGENTS = ['claude', 'cursor', 'codex'] as const
export type Agent = (typeof AGENTS)[number]

export interface Skill {
  name: string
  description: string
  body: string
}

export function loadSkills(packageRoot = PACKAGE_ROOT): Skill[] {
  const dir = join(packageRoot, 'skills')
  const preamble = readFileSync(join(dir, '_preamble.md'), 'utf8').trim()
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
    .map(f => {
      const { meta, body } = parseFrontmatter(readFileSync(join(dir, f), 'utf8'))
      return {
        name: String(meta.name),
        description: String(meta.description),
        body: `${body.trim()}\n\n${preamble}\n`,
      }
    })
}

const AGENTS_MD_START = '<!-- bearing:start -->'
const AGENTS_MD_END = '<!-- bearing:end -->'

// Returns the files written, relative to root.
export function setupAgent(root: string, agent: Agent, skills = loadSkills()): string[] {
  const written: string[] = []
  const write = (rel: string, content: string) => {
    const path = join(root, rel)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, content)
    written.push(rel)
  }

  if (agent === 'claude') {
    for (const s of skills) {
      write(join('.claude', 'skills', `bearing-${s.name}`, 'SKILL.md'), `---\nname: bearing-${s.name}\ndescription: ${JSON.stringify(s.description)}\n---\n\n${s.body}`)
    }
  }

  if (agent === 'cursor') {
    for (const s of skills) {
      write(join('.cursor', 'rules', `bearing-${s.name}.mdc`), `---\ndescription: ${JSON.stringify(s.description)}\nalwaysApply: false\n---\n\n${s.body}`)
    }
  }

  if (agent === 'codex') {
    for (const s of skills) write(join('.bearing', 'skills', `${s.name}.md`), s.body)
    const block = [
      AGENTS_MD_START,
      '## Operator OS workflows',
      '',
      'This project uses Bearing, built on Operator OS. Run `bearing context` before product work. When a request matches one of these workflows, read the file and follow it:',
      '',
      ...skills.map(s => `- \`.bearing/skills/${s.name}.md\`: ${s.description}`),
      AGENTS_MD_END,
    ].join('\n')
    const path = join(root, 'AGENTS.md')
    const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
    const re = new RegExp(`${AGENTS_MD_START}[\\s\\S]*?${AGENTS_MD_END}`)
    const next = re.test(current) ? current.replace(re, block) : `${current.trimEnd()}${current ? '\n\n' : ''}${block}\n`
    writeFileSync(path, next)
    written.push('AGENTS.md')
  }

  return written
}

export function detectAgents(root: string): Agent[] {
  const found: Agent[] = []
  if (existsSync(join(root, '.claude')) || existsSync(join(root, 'CLAUDE.md'))) found.push('claude')
  if (existsSync(join(root, '.cursor'))) found.push('cursor')
  if (existsSync(join(root, 'AGENTS.md')) || existsSync(join(root, '.codex'))) found.push('codex')
  return found
}
