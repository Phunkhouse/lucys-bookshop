# 0014. Shop photos: a plain img with srcset

Date: 2026-10-17
Status: accepted
Milestone: M2

## Context

The browser makes three sizes of every photo when it is added (480, 960 and 1600 px on the long edge), and the shop has to show them on catalog cards and book pages. The spec first said to use `next/image` with a small custom loader that picks the nearest size. Per Next's docs, a loader function cannot be passed from a server component; the alternative is a global `loaderFile`, which also runs in the browser and would need a public copy of `IMAGE_BASE_URL` (a `NEXT_PUBLIC_` variable).

## Decision

- Show photos with a plain `<img>` whose `srcset` lists the three real files with their real widths. One small component, `BookPhoto`, does it, so all photos are rendered the same way. The spec's image wording is updated.
- Cards show the cover (the first photo) cropped to a 3:4 box with an empty `alt`, because the title link already names the book. The book page shows all photos whole, in a swipe strip (CSS scroll-snap, no JavaScript), with `alt` "title – fotka n z N" (just the title for a single photo).
- The first photo on a page loads at once with high priority; the others load lazily. The real width and height are on the tag, so the page does not jump.
- The first photo is also the Open Graph image of the book page (the medium size, as a full address), so a shared link shows the cover.
- The copy step that puts a saved photo in place sets `Cache-Control: public, max-age=31536000, immutable`. Photos never change: a replacement is a new file with a new random id, so a new address.

## Alternatives considered

- `next/image` with `loaderFile`: follows the spec literally and adds a priority preload and a path to blur placeholders. It needs the public copy of `IMAGE_BASE_URL`, a client-side loader, and its `srcset` widths come from Next's fixed list, which fits our three files less exactly. Component tests would also not see the loader from `next.config`.
- A large photo with thumbnails, or all photos stacked, for the book page: the first needs client code for the selection, the second makes the page long.

## Consequences

- If we later want blur placeholders or an optimizing service, only `BookPhoto` and the config change.
- Page caching (ISR or a CDN in front of the pages) would need a look: a cached page could name a photo that was just replaced. Pages are rendered on every request today.
- The `Cache-Control` on copy works against the local test server (checked by the shared storage tests). Against real R2 it can only be seen in use, on a preview.
- Alt text only says which photo it is, not what it shows. AI-written descriptions are left for the SEO work (M7).
