import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The backup workflow handles the whole database and runs in a public repository,
// so what it may trigger on, read and leak is pinned here. The file is read as
// text: these are the rules a careless edit would break.
const workflow = readFileSync('.github/workflows/backup.yml', 'utf8')
const lines = workflow.split('\n')

// The lines of one top-level key, for example `on:`.
function block(key: string): string[] {
  const start = lines.findIndex((line) => line === `${key}:`)
  if (start === -1) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^\S/.test(line))
  return (end === -1 ? rest : rest.slice(0, end)).filter(
    (line) => line.trim() !== '' && !line.trim().startsWith('#'),
  )
}

describe('backup workflow', () => {
  it('runs only when dispatched, never on a push, a pull request or a timer', () => {
    const triggers = block('on').map((line) => line.trim())
    expect(triggers).toEqual(['workflow_dispatch:'])
  })

  it('reads the repository and nothing else', () => {
    expect(block('permissions').map((line) => line.trim())).toEqual([
      'contents: read',
    ])
  })

  it('never stores the dump as an artifact or in a cache', () => {
    expect(workflow).not.toMatch(/upload-artifact/)
    expect(workflow).not.toMatch(/actions\/cache/)
  })

  it('hands secrets to steps only as environment variables', () => {
    const uses = lines.filter((line) => line.includes('secrets.'))
    expect(uses.length).toBeGreaterThan(0)
    for (const line of uses) {
      expect(line.trim()).toMatch(
        /^[A-Z][A-Z0-9_]*: \$\{\{ secrets\.[A-Z][A-Z0-9_]* \}\}$/,
      )
    }
  })

  it('uses secrets only on lines of an env block, never in with: or run:', () => {
    lines.forEach((line, index) => {
      if (!line.includes('secrets.')) return
      const indent = line.length - line.trimStart().length
      const parent = lines
        .slice(0, index)
        .reverse()
        .find(
          (l) => l.trim() !== '' && l.length - l.trimStart().length < indent,
        )
      expect(parent?.trim()).toBe('env:')
    })
  })

  it('never echoes a secret or traces commands', () => {
    expect(workflow).not.toMatch(/set -\w*x/)
    expect(workflow).not.toMatch(/bash -\w*x/)
    expect(workflow).not.toMatch(
      /echo[^\n]*\$\{?\w*(DATABASE_URL|SECRET|PRIVATE)/,
    )
  })

  it('takes the public key from a variable, not from the file', () => {
    expect(workflow).toContain('vars.AGE_PUBLIC_KEY')
    expect(workflow).not.toMatch(/age1[a-z0-9]{20,}/)
  })

  it('pins every action to a commit', () => {
    for (const line of lines.filter((l) => l.includes('uses:'))) {
      expect(line).toMatch(/@[0-9a-f]{40}/)
    }
  })

  it('names the object like backupObjectKey does', () => {
    expect(workflow).toContain('daily/${day}/lucys-bookshop-${stamp}.dump.age')
  })

  it('serialises runs and lets a running one finish', () => {
    expect(block('concurrency').map((line) => line.trim())).toEqual([
      'group: backup',
      'cancel-in-progress: false',
    ])
  })
})
