import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { shopConfig } from '@/config/shop'
import { renderWithIntl } from '@/lib/render-with-intl'
import { SiteHeader } from './SiteHeader'

beforeEach(() => localStorage.clear())

describe('SiteHeader', () => {
  it('names the shop from the config and links home', () => {
    renderWithIntl(<SiteHeader />)
    const name = screen.getByRole('link', { name: shopConfig.name })
    expect(name.getAttribute('href')).toBe('/')
  })

  it('has a labelled navigation with the books and the cart', () => {
    renderWithIntl(<SiteHeader />)
    const nav = screen.getByRole('navigation', { name: 'Hlavní navigace' })
    expect(
      within(nav).getByRole('link', { name: 'Knihy' }).getAttribute('href'),
    ).toBe('/')
    expect(
      within(nav).getByRole('link', { name: 'Košík' }).getAttribute('href'),
    ).toBe('/cart')
  })
})
