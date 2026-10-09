import { parseDatabaseEnv } from './env.schema'

export const databaseEnv = parseDatabaseEnv(process.env)
