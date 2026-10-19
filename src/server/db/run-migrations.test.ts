import { describe, expect, it } from 'vitest'
import { missingMigrations } from './run-migrations'

describe('missingMigrations', () => {
  it('is empty when every local migration is applied', () => {
    expect(missingMigrations(['a', 'b'], ['a', 'b'])).toEqual([])
  })

  // The database may know more than this build does: an older commit is
  // rebuilt, or a rollback is redeployed. That is fine.
  it('does not mind migrations the database has and this build does not', () => {
    expect(missingMigrations(['a', 'b'], ['a', 'b', 'c'])).toEqual([])
  })

  it('names the local migrations that were not applied, in order', () => {
    expect(missingMigrations(['a', 'b', 'c', 'd'], ['a', 'c'])).toEqual([
      'b',
      'd',
    ])
  })

  it('reports everything for an empty database', () => {
    expect(missingMigrations(['a', 'b'], [])).toEqual(['a', 'b'])
  })

  it('is empty when there are no local migrations', () => {
    expect(missingMigrations([], ['a'])).toEqual([])
  })
})
