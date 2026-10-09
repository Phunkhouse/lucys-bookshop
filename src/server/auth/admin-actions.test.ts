import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Spec 6.9: every admin action checks the session itself. This scan fails the
// build when a server action under an admin route skips requireAdmin().

function isCallTo(node: ts.Node, name: string) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === name
  )
}

function containsCallTo(node: ts.Node, name: string): boolean {
  let found = false
  const visit = (child: ts.Node) => {
    if (isCallTo(child, name)) found = true
    else ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

function exportedFunctions(file: ts.SourceFile) {
  const result: { name: string; body: ts.Block | undefined }[] = []
  for (const statement of file.statements) {
    const exported = ts
      .getModifiers(statement as ts.HasModifiers)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!exported) continue

    if (ts.isFunctionDeclaration(statement)) {
      result.push({
        name: statement.name?.text ?? 'default',
        body: statement.body,
      })
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer
        if (
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          result.push({
            name: declaration.name.getText(),
            body: ts.isBlock(init.body) ? init.body : undefined,
          })
        }
      }
    }
  }
  return result
}

// Returns the exported functions whose first statement is not a requireAdmin() call.
export function findUnguardedActions(source: string): string[] {
  const file = ts.createSourceFile(
    'actions.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  )
  return exportedFunctions(file)
    .filter(({ body }) => {
      const first = body?.statements[0]
      return !first || !containsCallTo(first, 'requireAdmin')
    })
    .map(({ name }) => name)
}

function isUseServerFile(source: string) {
  const first = source.trimStart().split('\n', 1)[0]
  return /^['"]use server['"]/.test(first)
}

function adminFiles(dir: string, insideAdmin = false): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...adminFiles(path, insideAdmin || entry.name === 'admin'))
    } else if (
      insideAdmin &&
      /\.tsx?$/.test(entry.name) &&
      !/\.test\./.test(entry.name)
    ) {
      files.push(path)
    }
  }
  return files
}

describe('findUnguardedActions (the scanner itself)', () => {
  it('accepts an action that starts with requireAdmin', () => {
    const source = `'use server'
      export async function hideBook(id: string) {
        const actor = await requireAdmin(await headers())
        return hide(actor, id)
      }`
    expect(findUnguardedActions(source)).toEqual([])
  })

  it('flags an action without the check', () => {
    const source = `'use server'
      export async function hideBook(id: string) {
        return hide(id)
      }`
    expect(findUnguardedActions(source)).toEqual(['hideBook'])
  })

  it('flags an action that does other work before the check', () => {
    const source = `'use server'
      export async function hideBook(id: string) {
        await log(id)
        await requireAdmin(await headers())
      }`
    expect(findUnguardedActions(source)).toEqual(['hideBook'])
  })

  it('covers exported arrow functions and ignores unexported helpers', () => {
    const source = `'use server'
      export const hideBook = async (id: string) => {
        return hide(id)
      }
      async function helper() { return 1 }`
    expect(findUnguardedActions(source)).toEqual(['hideBook'])
  })
})

describe('admin server actions', () => {
  it('every exported action in an admin route calls requireAdmin first', () => {
    const unguarded: string[] = []
    for (const path of adminFiles(join(process.cwd(), 'src/app'))) {
      const source = readFileSync(path, 'utf8')
      if (!isUseServerFile(source)) continue
      for (const name of findUnguardedActions(source))
        unguarded.push(`${path}: ${name}`)
    }
    expect(unguarded).toEqual([])
  })
})
