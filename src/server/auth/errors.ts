export class UnauthorizedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Not signed in', options)
    this.name = 'UnauthorizedError'
  }
}
