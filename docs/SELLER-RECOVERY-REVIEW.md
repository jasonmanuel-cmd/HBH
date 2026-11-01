# Seller recovery corrections — local, not released

Reviewed all 11 Copilot comments on PR19 against the implementation. All describe confirmed defects; none were dismissed as not applicable. Production remains e9c0cc8 with seller operations OFF. These changes require a reviewed release and the additive recovery migration before activation.

| Finding | Local correction | Evidence |
| --- | --- | --- |
| Session bootstrap loses operations flag | Pass the returned flag on session restore as on login | Local browser reload/deep link retains disabled legacy workflow controls |
| Research selection retains another property's evidence | Reset record-specific form, property/requester confirmations and inquiry selection when research ID changes | VM regression and real local browser A-to-B selection show blank evidence and unchecked confirmations; same-ID refresh retains input |
| Same-batch source timestamps are ambiguous | Explicit monotonically increasing source_sequence under source lock; both review and link reject earlier or tied sequence | PGlite and PostgreSQL16.15 same-transaction two revisions, stale verification/link denial |
| Cancelled appointments still upcoming | Read appointment_result only in operations mode, exclude cancellation before upcoming LIMIT and in KPI | Actual HQ route through SQL adapter validates both displays; flags-off schemas need no new column |
| Historical rows hide waiting inquiries | Exclude historical intake before LIMIT | Nine older historical fixtures cannot hide newer genuine inquiry |
| Spam cannot be classified | Add evidence-required spam event; suppress and clear follow-up | Workflow unit and real HQ/SQL event tests |
| Reassignment breaks public duplicate retry | Let insert trigger assign Jay instead of including mutable assignee in public submission identity | Public/SQL replay after Billy assignment; existing workflow regression also tests Nathanael |
| SQLSTATE40001 reported as502 | Preserve safe code only in REST transport; return409; mock now models actual500 response | Stale revision API regression through SQL adapter and mock |
| Missing mail configuration claims job | Email adapter preflight executes before claim | Missing configuration results in zero claims and zero sends |
| Ambiguous browser retry changes revision | Retain original command through overview refresh; freeze inputs and expose explicit original-event retry/context | VM test advances server revision, removes selected lead, replays identical request/body; clear-on-logout restores input states |
| Opposite source lock order can deadlock | Acquire distinct source advisory locks in sorted order before processing payload; review/link share source lock | Two independent PostgreSQL connections import opposite ordering while a test-only trigger delays inserts; both finish, one inserts2 and the other0 |

The new migration is `20261101192507_seller_review_recovery.sql`, after `20261031235109_seller_operations.sql`. It does not alter historical migration files or delete lead data. Existing equal-time history is assigned tied ordering so it fails review/link conservatively until a later source revision resolves ambiguity. No migration has been applied to Supabase or Neon.

Independent read-only review found two additional pending-form bugs (filtered-out inquiry replay and editable form displaying a different event); both were corrected. Follow-up review also found and verified fixes for logout input cleanup, generic SQL error redaction, quoted search values and JSONB SQL-NULL preservation. No remaining injection or scoped query-contract blocker was reported.

## Remaining recovery limit

The pending command is in memory. Overview refresh/retry is recoverable; a full browser reload, tab loss or logout discards it. The pending state explicitly warns the operator not to reload/sign out until resolved and to inspect activity history before re-entering an interrupted event. No durable browser restart recovery or exactly-once delivery claim is made. A later server-side unresolved-command reconciliation flow is preferable to persisting sensitive command payloads in browser storage. This limitation remains deferred and is distinct from the fixed overview-refresh defect.

## Verification boundary

Local full suite: 105 tests passing; build:69 pages; syntax and diff checks passed. Actual PostgreSQL16.15 ran the complete migration chain and 11 checks, including distinct simultaneous outbox claims, stale leases, duplicate inquiry/workflow/import transactions, stale revision rejection, role denial, suppression, opposite-order imports and same-batch source ordering. The first attempt at the added concurrency test failed due to a dollar-quote error in the external test harness; correcting the harness and rerunning from a fresh temporary database passed all11. No application change was needed for that harness error.

Browser verification used loopback3188 with in-memory synthetic records and all external fetch blocked. Verified session restore, research evidence/checkbox reset, unchanged lead controls and zero research-created notifications. Pending-response failure/retry was exercised by the browser-script VM test, not a production network interruption.

No hosted Neon/Supabase driver, credentials, role translation, transfer/cutover, paid resource, real inquiry or real notification was tested. Production database and Jay/Billy notification configuration remain unchanged.
