# Website stats in shared HQ

Each site has a bookmarkable, authenticated report:

- `/hq/stats/harbison-standard`
- `/hq/stats/call-harbison`

Both reports use recorded first-party data, not generated sample totals. The browser sends `start`, `pageview`, and cumulative active-time `heartbeat` events. Heartbeats update one page-token record, so hiding and closing the same tab does not add time twice. A session is counted only when it has a matching recorded public page view. Average and median durations include zero-duration sessions; active time is an estimate, not proof that someone was reading.

Standard collects at its own `/api/track`. Call Harbison collects at its own `/api/track`, which forwards only server-to-server using the existing `CRM_INGEST_SECRET`. The trusted bridge forces the Call Harbison site label. Browser JavaScript never receives that secret or database credentials. Existing text path columns store Call Harbison paths as canonical absolute URLs to isolate them without changing or rewriting historical rows. Standard uses relative paths. Read-time filtering also checks that visits belong to the selected site's sessions.

The existing Standard analytics database is the reporting source. Call Harbison's leads database remains unchanged. The HQ server proxies aggregates through its authenticated API, with an explicit site allowlist. Individual reads are paginated to avoid the database's per-request row cap silently truncating totals. Oversized ranges fail visibly rather than returning partial totals.

Known bot user agents, HQ/API paths, local previews, and sessions with no recorded public view are excluded. Unknown automation and operator visits cannot always be distinguished from customers. Privacy choices, blocked scripts and failed requests can reduce collection. This is recorded traffic, not a guaranteed count of all human visitors.

Daily visitor hashes rotate; the total is the sum of daily estimates, not distinct people across a month. Raw visitor IPs are not retained, and Call Harbison forwards only a keyed daily hash. Coarse edge geography and device/browser categories are used; customer names, phone numbers, emails and form addresses are not collected by this feed. Both clients honor DNT/GPC and first-party analytics opt-out settings. Call Harbison's privacy page includes an opt-out control.

Call Harbison first-party history starts with this release on October 17, 2026. Existing GA4 history is not imported or presented as first-party records. Historic Standard bots remain stored but are excluded from reports; no historical customer records are deleted.

Regression coverage checks authenticated reads, site isolation, bot/admin/orphan exclusion, query stripping, the private visitor hash, privacy controls, and explicit error states. Live verification should compare a report before/after an actual public browser visit, confirm the other site's report is unchanged, and refresh the deep links to confirm routing and authentication.
