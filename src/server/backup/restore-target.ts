// Where a restore may write. A restore fills a database with an old copy of the
// data, so pointing it at the live one by mistake would be a second disaster. The
// script asks this before doing anything. Pure: it only reads the addresses.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export class UnsafeRestoreTargetError extends Error {}

function parse(text: string): URL {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new UnsafeRestoreTargetError('The target is not a database address.')
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new UnsafeRestoreTargetError(
      'The target must be a postgres:// address.',
    )
  }
  return url
}

// The server and database an address points at, ignoring the login, the query
// and the pooler: "ep-x-pooler.…" and "ep-x.…" are the same Neon database, and
// every spelling of this machine is one server.
function where(url: URL): string {
  const host = LOCAL_HOSTS.has(url.hostname)
    ? 'localhost'
    : url.hostname.toLowerCase().replace(/-pooler(?=\.)/, '')
  return `${host}:${url.port || '5432'}${url.pathname}`
}

export function assertSafeRestoreTarget(
  target: string,
  options: {
    allowRemote: boolean
    // The addresses of the databases the shop really uses; unset ones are skipped.
    protectedUrls: readonly (string | undefined)[]
  },
): void {
  const url = parse(target)
  if (url.pathname === '' || url.pathname === '/') {
    throw new UnsafeRestoreTargetError(
      'The target needs a database name at the end of the address.',
    )
  }
  if (!LOCAL_HOSTS.has(url.hostname) && !options.allowRemote) {
    throw new UnsafeRestoreTargetError(
      'The target is not on this machine. Pass --allow-remote to restore into a remote server.',
    )
  }
  for (const other of options.protectedUrls) {
    if (!other) continue
    if (where(parse(other)) === where(url)) {
      throw new UnsafeRestoreTargetError(
        'The target is a protected database (the same one DATABASE_URL, MIGRATION_DATABASE_URL or BACKUP_DATABASE_URL points at). Restore into a new, empty database.',
      )
    }
  }
}

// How a Docker container reaches a database that runs on this machine.
export function forContainer(databaseUrl: string): string {
  const url = new URL(databaseUrl)
  if (!LOCAL_HOSTS.has(url.hostname)) return databaseUrl
  url.hostname = 'host.docker.internal'
  return url.toString()
}
