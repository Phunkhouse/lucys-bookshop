# 0012. Admin auth: one level, accounts created by script

Date: 2026-10-08
Status: accepted
Milestone: M2

## Context

The spec planned two roles, `owner` (developer) and `seller`. In practice both people need the same powers: the seller runs the shop, and the developer tests and maintains it. The shop has no email service in v1, so an invite flow would need extra work.

## Decision

- **One admin level.** There is no role field. Every signed-in user is an admin, and there are two accounts: the developer and the seller.
- **Sign-up is disabled.** Accounts are created only by a script in `scripts/`, run against the target database, so being signed in is the same as being allowed.
- **The session is checked where the work happens.** Every server action and service entry point asserts the session. The proxy redirect is only a convenience for people who are not signed in.

## Alternatives considered

- Two roles (`owner`, `seller`): no feature needs a difference between them, so it would be extra code and tests with nothing to enforce.
- Invite flow or a user-management screen: needs email or extra UI for two accounts that are created once.

## Consequences

- Access control tests become simple: every admin action rejects a call without a session. A test that lists the admin actions keeps this true as they are added.
- There is no per-user audit trail. If we need to know who changed a book, add an `updatedBy` column later.
- A restricted role later (for example a helper who only lists books) would need a migration and a role check. Revisit then.
- The developer keeps an account after handover (spec 9). Use a strong password, and remove the account if that access is no longer wanted.
