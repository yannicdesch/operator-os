// The five context files at the repo root are the source of truth.
// `bearing init` scaffolds from a copy shipped in the package.
import { copyFileSync, mkdirSync } from 'node:fs'

const FILES = ['me.md', 'company.md', 'style.md', 'decisions.md', 'people.md']
mkdirSync('templates', { recursive: true })
for (const f of FILES) copyFileSync(f, `templates/${f}`)
