import { act, fireEvent, screen, within } from '@testing-library/react'
import useEmblaCarousel from 'embla-carousel-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { PhotoGallery } from './PhotoGallery'

// Embla needs a real browser (layout, dragging), so a stand-in plays its part.
// These tests check what we control: the markup, the labels, the counter, the
// buttons and how we use the carousel. The real dragging is checked in a browser.
const fake = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>()
  const state = { selected: 0, total: 3 }
  const api = {
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    canScrollPrev: () => state.selected > 0,
    canScrollNext: () => state.selected < state.total - 1,
    selectedScrollSnap: () => state.selected,
    on: vi.fn((event: string, handler: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
      return api
    }),
    off: vi.fn((event: string, handler: () => void) => {
      listeners.get(event)?.delete(handler)
      return api
    }),
  }
  const emit = (event: string) => listeners.get(event)?.forEach((h) => h())
  return { api, state, emit, listeners }
})

vi.mock('embla-carousel-react', () => ({ default: vi.fn() }))

const BASE = 'https://pub-abc.r2.dev'
const TITLE = 'Stíny nad Vltavou'
const photos = [
  { baseKey: 'books/b1/i1', width: 1200, height: 1600 },
  { baseKey: 'books/b1/i2', width: 1600, height: 1200 },
  { baseKey: 'books/b1/i3', width: 1200, height: 1600 },
]

function renderGallery(list = photos) {
  return renderWithIntl(
    <PhotoGallery
      photos={list}
      title={TITLE}
      imageBaseUrl={BASE}
      sizes="100vw"
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.listeners.clear()
  fake.state.selected = 0
  fake.state.total = 3
  vi.mocked(useEmblaCarousel).mockReturnValue([
    vi.fn(),
    fake.api,
  ] as unknown as ReturnType<typeof useEmblaCarousel>)
})

const region = () => screen.getByRole('region', { name: 'Fotky knihy' })
const select = (index: number) =>
  act(() => {
    fake.state.selected = index
    fake.emit('select')
  })

describe('PhotoGallery with several photos', () => {
  it('is a carousel named Fotky knihy, with one named slide per photo', () => {
    renderGallery()

    expect(region().getAttribute('aria-roledescription')).toBe('carousel')
    const slides = within(region()).getAllByRole('group', {
      name: /^Fotka \d z 3$/,
    })
    expect(slides.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Fotka 1 z 3',
      'Fotka 2 z 3',
      'Fotka 3 z 3',
    ])
    expect(
      slides.every((s) => s.getAttribute('aria-roledescription') === 'slide'),
    ).toBe(true)
  })

  it('describes each photo by the title and its place', () => {
    renderGallery()

    const slides = within(region()).getAllByRole('group', {
      name: /^Fotka \d z 3$/,
    })
    expect(
      slides.map((slide) => within(slide).getByRole('img').getAttribute('alt')),
    ).toEqual([
      'Stíny nad Vltavou – fotka 1 z 3',
      'Stíny nad Vltavou – fotka 2 z 3',
      'Stíny nad Vltavou – fotka 3 z 3',
    ])
  })

  it('loads the first photo at once with high priority, and the others lazily', () => {
    const { container } = renderGallery()

    const images = [...container.querySelectorAll('img')]
    expect(images.map((i) => i.getAttribute('loading'))).toEqual([
      'eager',
      'lazy',
      'lazy',
    ])
    expect(images[0].getAttribute('fetchpriority')).toBe('high')
    expect(images[1].hasAttribute('fetchpriority')).toBe(false)
  })

  it('shows the counter once, outside the slides, and keeps no caption inside them', () => {
    renderGallery()

    expect(screen.getAllByText('Fotka 1 z 3')).toHaveLength(1)
    const counter = screen.getByText('Fotka 1 z 3')
    const slides = within(region()).getAllByRole('group', {
      name: /^Fotka \d z 3$/,
    })
    for (const slide of slides) {
      expect(slide.contains(counter)).toBe(false)
      expect(within(slide).queryByText(/^Fotka \d z 3$/)).toBeNull()
    }
  })

  it('announces a change of photo politely, through a live region', () => {
    renderGallery()

    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Fotka 1 z 3')
    expect(status.getAttribute('aria-live')).toBe('polite')

    select(1)

    expect(status.textContent).toBe('Fotka 2 z 3')
  })

  it('does not loop, so the ends are real ends', () => {
    renderGallery()

    expect(vi.mocked(useEmblaCarousel).mock.calls[0][0]).toMatchObject({
      loop: false,
    })
  })
})

describe('PhotoGallery buttons', () => {
  it('has Předchozí disabled on the first photo and Další enabled', () => {
    renderGallery()

    expect(
      (
        screen.getByRole('button', {
          name: 'Předchozí fotka',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Další fotka' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('goes to the next and the previous photo when clicked', () => {
    renderGallery()
    select(1)

    fireEvent.click(screen.getByRole('button', { name: 'Další fotka' }))
    fireEvent.click(screen.getByRole('button', { name: 'Předchozí fotka' }))

    expect(fake.api.scrollNext).toHaveBeenCalledTimes(1)
    expect(fake.api.scrollPrev).toHaveBeenCalledTimes(1)
  })

  it('follows the carousel: the counter and the buttons update, and Další is disabled at the end', () => {
    renderGallery()

    select(1)
    expect(screen.getByRole('status').textContent).toBe('Fotka 2 z 3')
    expect(
      (
        screen.getByRole('button', {
          name: 'Předchozí fotka',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)

    select(2)
    expect(screen.getByRole('status').textContent).toBe('Fotka 3 z 3')
    expect(
      (screen.getByRole('button', { name: 'Další fotka' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('also follows the carousel when it re-measures itself (a window resize)', () => {
    renderGallery()

    act(() => {
      fake.state.selected = 2
      fake.emit('reInit')
    })

    expect(screen.getByRole('status').textContent).toBe('Fotka 3 z 3')
  })

  it('works before the carousel has started: first photo, Předchozí disabled, nothing breaks on a click', () => {
    vi.mocked(useEmblaCarousel).mockReturnValue([
      vi.fn(),
      undefined,
    ] as unknown as ReturnType<typeof useEmblaCarousel>)
    renderGallery()

    expect(screen.getByRole('status').textContent).toBe('Fotka 1 z 3')
    expect(
      (
        screen.getByRole('button', {
          name: 'Předchozí fotka',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Další fotka' })),
    ).not.toThrow()
  })
})

describe('PhotoGallery keyboard', () => {
  const viewport = () => region().querySelector('[tabindex="0"]') as HTMLElement

  it('is a tab stop, and the arrow keys move between photos', () => {
    renderGallery()

    expect(viewport()).toBeTruthy()
    fireEvent.keyDown(viewport(), { key: 'ArrowRight' })
    fireEvent.keyDown(viewport(), { key: 'ArrowLeft' })

    expect(fake.api.scrollNext).toHaveBeenCalledTimes(1)
    expect(fake.api.scrollPrev).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', () => {
    renderGallery()

    fireEvent.keyDown(viewport(), { key: 'Enter' })
    fireEvent.keyDown(viewport(), { key: 'a' })

    expect(fake.api.scrollNext).not.toHaveBeenCalled()
    expect(fake.api.scrollPrev).not.toHaveBeenCalled()
  })
})

describe('PhotoGallery cleanup', () => {
  it('stops listening to the carousel when it is removed', () => {
    const { unmount } = renderGallery()
    expect(fake.listeners.get('select')?.size).toBe(1)
    expect(fake.listeners.get('reInit')?.size).toBe(1)

    unmount()

    expect(fake.listeners.get('select')?.size).toBe(0)
    expect(fake.listeners.get('reInit')?.size).toBe(0)
  })
})

describe('PhotoGallery with one photo', () => {
  it('is just the picture: no carousel, buttons, counter or tab stop, described by the title', () => {
    const { container } = renderGallery([photos[0]])

    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(container.querySelector('[tabindex]')).toBeNull()
    const img = container.querySelector('img')!
    expect(img.getAttribute('alt')).toBe(TITLE)
    expect(img.getAttribute('loading')).toBe('eager')
  })

  it('does not start the carousel for a single photo', () => {
    renderGallery([photos[0]])

    expect(fake.api.on).not.toHaveBeenCalled()
  })
})
