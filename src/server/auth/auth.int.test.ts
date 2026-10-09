import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { resetDatabase } from '@/server/db/test-helpers'
import { account, session, user } from '@/server/db/schema'
import { createAdmin } from './create-admin'
import { createAuth } from './create-auth'

const BASE_URL = 'http://localhost:3000'
const SECRET = 'test-secret-test-secret-test-secret-1234'
const EMAIL = 'lucy@example.com'
const PASSWORD = 'correct horse battery'

type Auth = ReturnType<typeof createAuth>

function makeAuth(): Auth {
  return createAuth({ db, secret: SECRET, baseUrl: BASE_URL })
}

function post(auth: Auth, path: string, body: unknown, init: HeadersInit = {}) {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: BASE_URL,
        'x-forwarded-for': '203.0.113.7',
        ...init,
      },
      body: JSON.stringify(body),
    }),
  )
}

const signIn = (auth: Auth, email: string, password: string, ip?: string) =>
  post(
    auth,
    '/sign-in/email',
    { email, password },
    ip ? { 'x-forwarded-for': ip } : {},
  )

function cookieFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

const sessionFor = (auth: Auth, cookie: string) =>
  auth.api.getSession({ headers: new Headers({ cookie }) })

let auth: Auth

beforeEach(async () => {
  await resetDatabase()
  auth = makeAuth()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createAdmin', () => {
  it('creates the user and a credential account, and the account can sign in', async () => {
    await createAdmin(auth, { name: 'Lucy', email: EMAIL, password: PASSWORD })

    const response = await signIn(auth, EMAIL, PASSWORD)
    expect(response.status).toBe(200)
  })

  it('stores a hash, not the password', async () => {
    await createAdmin(auth, { name: 'Lucy', email: EMAIL, password: PASSWORD })

    const [row] = await db.select().from(account)
    expect(row.providerId).toBe('credential')
    expect(row.password).toBeTruthy()
    expect(row.password).not.toContain(PASSWORD)
  })

  it('refuses a duplicate email, whatever its letter case', async () => {
    await createAdmin(auth, { name: 'Lucy', email: EMAIL, password: PASSWORD })

    await expect(
      createAdmin(auth, {
        name: 'Other',
        email: 'LUCY@example.com',
        password: PASSWORD,
      }),
    ).rejects.toThrow()
    expect(await db.select().from(user)).toHaveLength(1)
  })

  it('refuses a password shorter than 12 characters', async () => {
    await expect(
      createAdmin(auth, {
        name: 'Lucy',
        email: EMAIL,
        password: 'elevenchars',
      }),
    ).rejects.toThrow()
    expect(await db.select().from(user)).toHaveLength(0)
  })

  it('never logs the password', async () => {
    const spies = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ]
    await createAdmin(auth, { name: 'Lucy', email: EMAIL, password: PASSWORD })
    await signIn(auth, EMAIL, PASSWORD)
    await signIn(auth, EMAIL, 'wrong password 123')

    const output = spies
      .flatMap((s) => s.mock.calls)
      .flat()
      .map(String)
      .join('\n')
    expect(output).not.toContain(PASSWORD)
    expect(output).not.toContain('wrong password 123')
  })
})

describe('sign-in', () => {
  beforeEach(async () => {
    await createAdmin(auth, { name: 'Lucy', email: EMAIL, password: PASSWORD })
  })

  it('creates a session whose cookie resolves to the user', async () => {
    const response = await signIn(auth, EMAIL, PASSWORD)

    const found = await sessionFor(auth, cookieFrom(response))
    expect(found?.user.email).toBe(EMAIL)
    expect(await db.select().from(session)).toHaveLength(1)
  })

  it('rejects a wrong password and creates no session', async () => {
    const response = await signIn(auth, EMAIL, 'not the password 1')

    expect(response.status).toBe(401)
    expect(await db.select().from(session)).toHaveLength(0)
  })

  it('answers an unknown email exactly like a wrong password', async () => {
    const wrongPassword = await signIn(auth, EMAIL, 'not the password 1')
    const unknownEmail = await signIn(
      auth,
      'nobody@example.com',
      'not the password 1',
    )

    expect(unknownEmail.status).toBe(wrongPassword.status)
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json())
  })
})

describe('sign-up is disabled', () => {
  const body = {
    name: 'Intruder',
    email: 'intruder@example.com',
    password: PASSWORD,
  }

  it('rejects the HTTP endpoint and creates no user', async () => {
    const response = await post(auth, '/sign-up/email', body)

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await response.json()).toMatchObject({
      code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
    })
    expect(await db.select().from(user)).toHaveLength(0)
  })

  it('rejects the server-side API too and creates no user', async () => {
    await expect(auth.api.signUpEmail({ body })).rejects.toMatchObject({
      body: { code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' },
    })
    expect(await db.select().from(user)).toHaveLength(0)
  })
})

describe('sessions end', () => {
  let cookie: string

  beforeEach(async () => {
    await createAdmin(auth, { name: 'Lucy', email: EMAIL, password: PASSWORD })
    cookie = cookieFrom(await signIn(auth, EMAIL, PASSWORD))
  })

  it('signing out deletes the session, and the old cookie stops working', async () => {
    const response = await post(auth, '/sign-out', {}, { cookie })

    expect(response.status).toBe(200)
    expect(await db.select().from(session)).toHaveLength(0)
    expect(await sessionFor(auth, cookie)).toBeNull()
  })

  it('an expired session is rejected', async () => {
    await db.update(session).set({ expiresAt: new Date(Date.now() - 1000) })

    expect(await sessionFor(auth, cookie)).toBeNull()
  })

  it('a session row removed from the database is rejected', async () => {
    await db
      .delete(session)
      .where(eq(session.userId, (await db.select().from(user))[0].id))

    expect(await sessionFor(auth, cookie)).toBeNull()
  })
})

describe('login rate limit', () => {
  beforeEach(async () => {
    await createAdmin(auth, { name: 'Lucy', email: EMAIL, password: PASSWORD })
  })

  it('blocks the 6th attempt from one address, even with correct credentials', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await signIn(
        auth,
        EMAIL,
        'not the password 1',
        '198.51.100.9',
      )
      expect(response.status).toBe(401)
    }

    const blocked = await signIn(auth, EMAIL, PASSWORD, '198.51.100.9')
    expect(blocked.status).toBe(429)
  })

  it('counts per address', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await signIn(auth, EMAIL, 'not the password 1', '198.51.100.9')
    }

    const other = await signIn(auth, EMAIL, PASSWORD, '198.51.100.10')
    expect(other.status).toBe(200)
  })

  it('keeps the count in the database, so another server instance sees it', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await signIn(auth, EMAIL, 'not the password 1', '198.51.100.9')
    }

    const otherInstance = makeAuth()
    const blocked = await signIn(otherInstance, EMAIL, PASSWORD, '198.51.100.9')
    expect(blocked.status).toBe(429)
  })
})
