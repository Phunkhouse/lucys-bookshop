import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { CatalogNoResults } from './CatalogNoResults'

describe('CatalogNoResults', () => {
  it('says nothing matched and offers a way back to the whole catalog', () => {
    renderWithIntl(<CatalogNoResults />)
    expect(
      screen.getByText('Žádná kniha neodpovídá vašemu výběru.'),
    ).toBeDefined()
    expect(
      screen
        .getByRole('link', { name: 'Zrušit hledání a filtry' })
        .getAttribute('href'),
    ).toBe('/')
  })
})
