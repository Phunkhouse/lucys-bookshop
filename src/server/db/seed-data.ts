// Invented seed data for local development. Nothing here is a real listing:
// titles, authors and ISBNs are made up. Never replace it with real books or photos.

import type { bookCondition } from './schema'

type Condition = (typeof bookCondition.enumValues)[number]

export const SEED_GENRES = [
  { key: 'novel', slug: 'roman' },
  { key: 'crime', slug: 'detektivka' },
  { key: 'scifi', slug: 'sci-fi' },
  { key: 'fantasy', slug: 'fantasy' },
  { key: 'history', slug: 'historie' },
  { key: 'children', slug: 'pro-deti' },
  { key: 'poetry', slug: 'poezie' },
  { key: 'nonfiction', slug: 'nauchna-literatura' },
] as const

type State =
  | { kind: 'available' }
  // Negative hours means the reservation has already expired.
  | { kind: 'reserved'; hoursLeft: number }
  | { kind: 'sold'; hoursAgo: number }
  | { kind: 'hidden' }

type SeedBook = {
  title: string
  author: string
  language: string
  condition: Condition
  priceCzk: number
  genres: (typeof SEED_GENRES)[number]['key'][]
  state: State
  description?: string
  conditionNote?: string
  isbn?: string
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const BOOKS: SeedBook[] = [
  // Available
  {
    title: 'Stíny nad Vltavou',
    author: 'Marta Hrubešová',
    language: 'cs',
    condition: 'used',
    priceCzk: 189,
    genres: ['crime', 'novel'],
    state: { kind: 'available' },
    description: 'Detektivní příběh z podzimní Prahy. Obálka mírně obroušená.',
    isbn: '9780000000019',
  },
  {
    title: 'Poslední vlak do Brna',
    author: 'Karel Dvořáček',
    language: 'cs',
    condition: 'like_new',
    priceCzk: 249,
    genres: ['novel'],
    state: { kind: 'available' },
    description: 'Jednou přečtená, bez poznámek.',
  },
  {
    title: "The Clockmaker's Apprentice",
    author: 'Oliver Penhallow',
    language: 'en',
    condition: 'like_new',
    priceCzk: 329,
    genres: ['fantasy'],
    state: { kind: 'available' },
    description: 'Paperback in English.',
    isbn: '9780000000026',
  },
  {
    title: 'Hvězdy nad Hradčany',
    author: 'Jindřiška Valentová',
    language: 'cs',
    condition: 'used',
    priceCzk: 159,
    genres: ['scifi'],
    state: { kind: 'available' },
    conditionNote: 'Ohnuté rohy, text v pořádku.',
  },
  {
    title:
      'Příliš dlouhý název knihy o žluťoučkém koni, který se ztratil v lese za devíti horami',
    author: 'Tomáš Vrbický',
    language: 'cs',
    condition: 'used',
    priceCzk: 99,
    genres: ['children'],
    state: { kind: 'available' },
  },
  {
    title: 'Kuchařka mé babičky',
    author: 'Božena Lesáková',
    language: 'cs',
    condition: 'used',
    priceCzk: 120,
    genres: ['nonfiction'],
    state: { kind: 'available' },
    description: 'Domácí recepty, pevná vazba.',
    conditionNote: 'Mastná skvrna na straně 42.',
  },
  {
    title: 'Letní básně',
    author: 'Eliška Moravcová',
    language: 'cs',
    condition: 'like_new',
    priceCzk: 140,
    genres: ['poetry'],
    state: { kind: 'available' },
  },
  {
    title: 'Dějiny jednoho města',
    author: 'Pavel Šindelář',
    language: 'cs',
    condition: 'used',
    priceCzk: 390,
    genres: ['history', 'nonfiction'],
    state: { kind: 'available' },
    description: 'Rozsáhlá publikace s mapami.',
    isbn: '9780000000033',
  },
  {
    title: 'Tides of Salt',
    author: 'Imogen Fairweather',
    language: 'en',
    condition: 'used',
    priceCzk: 210,
    genres: ['novel'],
    state: { kind: 'available' },
  },
  {
    title: 'Vlk z Černé hory',
    author: 'Ondřej Kratochvíl',
    language: 'cs',
    condition: 'used',
    priceCzk: 175,
    genres: ['fantasy', 'novel'],
    state: { kind: 'available' },
    description: 'První díl trilogie.',
  },
  {
    title: 'Tajemství starého mlýna',
    author: 'Hana Procházková-Veselá',
    language: 'cs',
    condition: 'like_new',
    priceCzk: 130,
    genres: ['children'],
    state: { kind: 'available' },
    description: 'Ilustrovaná kniha pro začínající čtenáře.',
  },
  {
    title: 'Železná cesta',
    author: 'Bohumil Štěpán',
    language: 'cs',
    condition: 'like_new',
    priceCzk: 340,
    genres: ['history', 'nonfiction'],
    state: { kind: 'available' },
  },
  {
    title: 'Beyond the Amber Gate',
    author: 'Callum Hartwell',
    language: 'en',
    condition: 'used',
    priceCzk: 240,
    genres: ['fantasy'],
    state: { kind: 'available' },
  },
  {
    title: 'Malý průvodce hvězdnou oblohou',
    author: 'Irena Kubíková',
    language: 'cs',
    condition: 'like_new',
    priceCzk: 199,
    genres: ['nonfiction', 'children'],
    state: { kind: 'available' },
  },
  {
    title: 'Dopisy z ostrova',
    author: 'Ludmila Pešková',
    language: 'cs',
    condition: 'used',
    priceCzk: 130,
    genres: ['novel'],
    state: { kind: 'available' },
  },
  {
    title: 'Kód Prométheus',
    author: 'Radek Hanuš',
    language: 'cs',
    condition: 'used',
    priceCzk: 170,
    genres: ['scifi', 'crime'],
    state: { kind: 'available' },
  },
  {
    title: 'Zahrada u Dunaje',
    author: 'Katarína Mráziková',
    language: 'sk',
    condition: 'used',
    priceCzk: 160,
    genres: ['novel'],
    state: { kind: 'available' },
    description: 'Slovenské vydanie.',
  },
  {
    title: 'Rozhovory s tichem',
    author: 'Jan Vondrák',
    language: 'cs',
    condition: 'used',
    priceCzk: 75,
    genres: ['poetry'],
    state: { kind: 'available' },
  },
  // Reserved, reservation still running
  {
    title: 'Mrtvá schránka',
    author: 'Rudolf Kubíček',
    language: 'cs',
    condition: 'used',
    priceCzk: 110,
    genres: ['crime'],
    state: { kind: 'reserved', hoursLeft: 20 },
  },
  {
    title: 'Atlas zapomenutých cest',
    author: 'Lucie Brabcová',
    language: 'cs',
    condition: 'like_new',
    priceCzk: 520,
    genres: ['nonfiction'],
    state: { kind: 'reserved', hoursLeft: 40 },
  },
  {
    title: 'Noční hlídka na Marsu',
    author: 'Viktor Sedláček',
    language: 'cs',
    condition: 'used',
    priceCzk: 145,
    genres: ['scifi'],
    state: { kind: 'reserved', hoursLeft: 2 },
  },
  // Reserved, reservation expired (counts as available)
  {
    title: 'Ostrov bez jména',
    author: 'Jaroslav Mikula',
    language: 'cs',
    condition: 'used',
    priceCzk: 99,
    genres: ['novel'],
    state: { kind: 'reserved', hoursLeft: -5 },
  },
  {
    title: 'Ledová koruna',
    author: 'Adéla Zemanová',
    language: 'cs',
    condition: 'like_new',
    priceCzk: 280,
    genres: ['fantasy'],
    state: { kind: 'reserved', hoursLeft: -30 },
  },
  // Sold within 14 days (listed)
  {
    title: 'Gardens of Winter',
    author: 'Rosalind Ashcombe',
    language: 'en',
    condition: 'used',
    priceCzk: 190,
    genres: ['novel'],
    state: { kind: 'sold', hoursAgo: 24 },
  },
  {
    title: 'Zlatý věk řemesel',
    author: 'Miloslav Hanzl',
    language: 'cs',
    condition: 'used',
    priceCzk: 260,
    genres: ['history'],
    state: { kind: 'sold', hoursAgo: 6 * 24 },
  },
  {
    title: 'Pohádky z Šumavy',
    author: 'Věra Kalinová',
    language: 'cs',
    condition: 'used',
    priceCzk: 90,
    genres: ['children'],
    state: { kind: 'sold', hoursAgo: 13 * 24 + 12 },
  },
  // Sold longer ago (not listed, detail page still works)
  {
    title: 'Plavba k jihu',
    author: 'Emil Dostál',
    language: 'cs',
    condition: 'used',
    priceCzk: 150,
    genres: ['novel'],
    state: { kind: 'sold', hoursAgo: 20 * 24 },
  },
  {
    title: 'Sbírka drobných zločinů',
    author: 'Alena Fialová',
    language: 'cs',
    condition: 'used',
    priceCzk: 80,
    genres: ['crime'],
    state: { kind: 'sold', hoursAgo: 60 * 24 },
  },
  // Hidden (no public page)
  {
    title: 'Skryté kapitoly',
    author: 'Zdeněk Machala',
    language: 'cs',
    condition: 'used',
    priceCzk: 60,
    genres: ['novel'],
    state: { kind: 'hidden' },
  },
  {
    title: 'Hlas v kamenech',
    author: 'Soňa Řezníčková',
    language: 'cs',
    condition: 'used',
    priceCzk: 99,
    genres: ['poetry'],
    state: { kind: 'hidden' },
  },
]

export type SeedBookRow = {
  shortId: string
  title: string
  author: string
  isbn: string | null
  description: string
  language: string
  condition: Condition
  conditionNote: string | null
  priceMinor: number
  status: 'available' | 'reserved' | 'sold' | 'hidden'
  reservedUntil: Date | null
  soldAt: Date | null
  createdAt: Date
  genres: string[]
}

// Dates are relative to `now`, so a re-run keeps reservations and sales meaningful.
// Short ids are fixed (seed0001, seed0002, ...) so re-running updates rows in place.
export function buildSeedBooks(now: Date): SeedBookRow[] {
  return BOOKS.map((b, i) => ({
    shortId: `seed${String(i + 1).padStart(4, '0')}`,
    title: b.title,
    author: b.author,
    isbn: b.isbn ?? null,
    description: b.description ?? '',
    language: b.language,
    condition: b.condition,
    conditionNote: b.conditionNote ?? null,
    priceMinor: b.priceCzk * 100,
    status: b.state.kind,
    reservedUntil:
      b.state.kind === 'reserved'
        ? new Date(now.getTime() + b.state.hoursLeft * HOUR)
        : null,
    soldAt:
      b.state.kind === 'sold'
        ? new Date(now.getTime() - b.state.hoursAgo * HOUR)
        : null,
    // Spread listing dates over the last month so "newest first" has an order.
    createdAt: new Date(now.getTime() - (BOOKS.length - i) * DAY),
    genres: b.genres,
  }))
}
