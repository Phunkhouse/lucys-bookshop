import { randomInt } from 'node:crypto'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

// 8 random lowercase letters and digits: the public part of a book's URL.
// Unique only by chance (36^8 combinations); the database's unique constraint
// is the real guarantee, and callers retry on a collision.
export function generateShortId(): string {
  let id = ''
  for (let i = 0; i < 8; i++) id += ALPHABET[randomInt(ALPHABET.length)]
  return id
}
