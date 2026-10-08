import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from '@/components/Badge'

describe('Badge', () => {
  it('renders its text', () => {
    render(<Badge>Rezervováno</Badge>)
    expect(screen.getByText('Rezervováno')).toBeDefined()
  })

  it('renders with a tone', () => {
    render(<Badge tone="sold">Prodáno</Badge>)
    expect(screen.getByText('Prodáno')).toBeDefined()
  })
})
