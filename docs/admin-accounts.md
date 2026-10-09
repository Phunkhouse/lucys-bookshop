# Admin accounts

How to create and manage the admin logins (ADR 0012). Everything here uses invented example values. Never put a real email, password or connection string in the repo, in an issue or in a PR.

## Rules

- Sign-up is disabled. An account exists only because someone ran `pnpm admin:create`.
- Every account has full admin rights. There are no roles.
- The password is typed into the terminal when the script asks. It is hidden, asked twice, and must be at least 12 characters. It never goes into the command, so it stays out of shell history.
- The email is the login name. The name is only a label. Quote it if it has a space.

## Create an account locally

Needs the local database running (`pnpm db:up`) and migrations applied (`pnpm db:migrate`). The script reads `DATABASE_URL` from `.env`.

```bash
pnpm admin:create admin@example.com "Example Admin"
```

Then run `pnpm dev` and sign in at `/login`.

## Create an account on Neon (deployed shop)

The deployed site reads the database it is configured with in Vercel, so the account must be created in that same database.

1. **Migrations first.** The auth tables must exist in that database. Run `pnpm db:migrate` with the same `DATABASE_URL` as in step 2.
2. **Get the connection string** from the Neon console (the project's connection details). It must end with `?sslmode=verify-full` (ADR 0009). It looks like `postgresql://<user>:<password>@<host>/<database>?sslmode=verify-full`. It is a secret.
3. **Run the script** with the URL set only for this one session, so it is not saved in `.env` or in shell history:

```bash
read -rs DATABASE_URL   # paste the connection string, press Enter (nothing is shown)
export DATABASE_URL
pnpm admin:create admin@example.com "Example Admin"
unset DATABASE_URL
```

4. **Check it:** open the deployed site's `/login` and sign in.

Repeat for each person (the developer and the seller), each with their own email and password. The seller's password is best set with her present, or sent through a safe channel and changed later.

## Not supported yet

There is no script for changing a password, email or name, or for deleting an account. If one is needed, delete the row in the Neon SQL editor and create the account again. Its sessions and password record are removed with it (`ON DELETE CASCADE`):

```sql
delete from "user" where email = 'admin@example.com';
```

Add a script if this comes up often.

## Troubleshooting

| Message or symptom                                     | Cause and fix                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `An account with this email already exists`            | The email is taken (letter case is ignored). Use another email, or delete the old row as above.               |
| `Too small: expected string to have >=12 characters`   | The password is shorter than 12 characters.                                                                   |
| `Passwords do not match.`                              | The two entries differ. Run the command again.                                                                |
| A database error saying relation "user" does not exist | Migrations were not applied to that database. Run `pnpm db:migrate` with the same `DATABASE_URL`.             |
| Sign-in fails with an origin error in the browser      | `BETTER_AUTH_URL` must match the address you open (see `.env.example`). Restart the server after changing it. |
| Sign-in answers "too many attempts"                    | The rate limit allows 5 attempts per address per 15 minutes. Wait and try again.                              |
