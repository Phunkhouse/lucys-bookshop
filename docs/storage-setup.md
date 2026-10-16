# Photo storage

Where book photos are kept and how to set it up. Everything here uses invented example values. Never put a real key, secret or token in the repo, in an issue or in a PR.

## How it works

- Photos live in an S3-compatible bucket: **Cloudflare R2** in production, a **local server from docker compose** in development and in CI (decision: ADR 0006, spec section 10).
- The browser resizes each photo into three JPEG sizes (480, 960 and 1600 px on the long edge), asks the server for permission, and uploads them straight to the bucket with presigned URLs. They wait in `uploads/<id>/` until the book is saved.
- On Save the server checks every file (type, size, first and last bytes, the real picture size), copies the three sizes to `books/<bookId>/<imageId>/`, writes the database rows and deletes the staging copies. A photo is never part of a book before this check.
- Shop pages read photos from `IMAGE_BASE_URL`.

## Settings

| Variable                    | Meaning                                                                              | Secret?         |
| --------------------------- | ------------------------------------------------------------------------------------ | --------------- |
| `STORAGE_ENDPOINT`          | S3 address, `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` for R2                   | No              |
| `STORAGE_BUCKET`            | Bucket name                                                                          | No              |
| `STORAGE_ACCESS_KEY_ID`     | S3 access key from the R2 API token                                                  | Treat as secret |
| `STORAGE_SECRET_ACCESS_KEY` | S3 secret from the R2 API token                                                      | **Yes**         |
| `STORAGE_REGION`            | `auto` for R2 (default)                                                              | No              |
| `STORAGE_FORCE_PATH_STYLE`  | `true` for the local server, `false` for R2 (default)                                | No              |
| `IMAGE_BASE_URL`            | Where photos are read from: a public address, or a path on the app such as `/images` | No              |

## Locally

`pnpm db:up` starts Postgres and the local storage server (`docker compose`, service `storage`, with a one-off `storage-init` that creates the bucket `bookshop`). Copy the `STORAGE_*` and `IMAGE_BASE_URL` lines from `.env.example` into `.env`; they point at it. Its login is a well-known local default, not a secret. Anyone may read from it and only that login may write, like the public R2 address.

`pnpm test:db` creates a throwaway bucket on that server for each run and removes it afterwards. It refuses to do this on any address that is not local.

## Cloudflare R2 (production)

1. **Bucket.** In the Cloudflare dashboard, **Storage & databases → R2 → Overview → Create bucket**. Pick a location hint in Europe, not a jurisdiction (a jurisdiction changes the S3 address), and keep **Standard** storage.
2. **Public reads.** In the bucket's **Settings**, under **Public Development URL**, enable it (type `allow`). The address `https://pub-<random>.r2.dev` is `IMAGE_BASE_URL`. Cloudflare says it is rate-limited and meant for development, so before launch move to a custom domain or let the app serve the images (a path in `IMAGE_BASE_URL`); only that variable changes.
3. **CORS.** In **Settings → CORS Policy → Add CORS policy**, JSON tab:

```json
[
  {
    "AllowedOrigins": [
      "https://lucys-bookshop.vercel.app",
      "https://lucys-bookshop-*.vercel.app"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

The origins must match the addresses the browser shows, with `https://` and no trailing slash. A change takes about 30 seconds.

4. **Expiry for abandoned uploads.** In the bucket's **Settings**, under **Object Lifecycle Rules**, click **Add**. Rule name `expire-staging-uploads`; under **Rule scope**, the prefix `uploads/` (it says optional, but **never leave it empty**: without a prefix the rule would also delete saved photos); under **Lifecycle action**, tick **Delete uploaded objects after** and set 1 Day. Save changes. It removes photos that were uploaded but never saved with a book. Cloudflare deletes expired objects within about a day of their expiry, so "1 day" means one to two. A default rule, "Default Multipart Abort Rule", already exists and is left as it is.
5. **API token.** **R2 → Overview → Account Details → Manage API Tokens → Create Account API token**, permission **Object Read & Write**, limited to this one bucket. Copy the Access Key ID and the Secret Access Key (shown once) into a password manager. The raw "Token value" is not used by the app.
6. **Vercel.** In the project's **Settings → Environment Variables**, add the variables above for Production and Preview.

Budget alerts are in **Manage Account → Billing → Billable Usage**; Cloudflare has no hard spending cap for R2.

## Troubleshooting

| Symptom                                                 | Cause and fix                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Browser console shows a CORS error on upload            | The page's address is not in `AllowedOrigins`, or the policy was saved less than 30 seconds ago.      |
| Upload answers 403 `SignatureDoesNotMatch`              | The file was sent with another content type than `image/jpeg`, or the URL expired (10 minutes).       |
| Photos do not show on the shop                          | `IMAGE_BASE_URL` is wrong, or the bucket has no public address enabled.                               |
| Saving a book says a photo is missing or invalid        | The upload did not finish or failed the checks (not a JPEG, over 2 MB, longer than 1600 px, cut off). |
| `The STORAGE_* settings are not set` when running tests | Copy the storage lines from `.env.example` into `.env` and run `pnpm db:up`.                          |

## Handover

When production moves to the seller's Cloudflare account (spec section 9): create a bucket and token there as above, copy the objects, update the `STORAGE_*` and `IMAGE_BASE_URL` variables in her Vercel project, and redeploy.
