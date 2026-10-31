# Search and answer visibility review — 2026-10-31

## Implemented in this draft

- Correct the responsible brokerage from Harbison Standard to **The Mora Partners Inc. (DRE 02227690)** in configuration, visible English/Spanish disclosures, and connected structured data. Keep Harbison Standard's existing profile link separate. Link directly to Nathanael's DRE record. Do not repurpose the broker's mailing address as a CallHarbison office.
- Preserve the existing canonical HTTPS/www host, bilingual self-canonicals and alternate-language links, sitemap, visible FAQs, and JSON-LD graph.
- Make the explicitly named crawler group's Spanish utility-path exclusions match the wildcard group. This does not change the existing policy allowing training/search crawlers, nor promise citations. Robots exclusions are not authentication or a guaranteed deindexing mechanism.
- Provide separate `tel:` and `sms:` actions in primary call/text buttons, contact page, footer, and mobile bar. SMS links open a visitor's messaging app; they do not send an automatic message.
- Remove the thank-you page's assumption that a confirmation SMS was sent. Explain that the initial form requires address, name, phone, and response permission, rather than claiming address alone is sufficient.
- Add five regression tests for identity/schema, correct phone actions in both languages, truthful copy, canonical/noindex integrity, and crawler-rule parity. Spanish dictionary completeness remains tested separately.

## Evidence and interpretation

California DRE lists Nathanael Harbison (02059393) under responsible broker The Mora Partners Inc. (02227690). Both records were checked; the displayed source snapshots are dated October 22/24, 2026. DRE cautions that pending changes may not yet be reflected.

- https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id=02059393
- https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id=02227690

Google's current generative-search guidance treats AEO/GEO as ordinary search optimization: useful original content, crawlable pages, and clear evidence matter. Special AI markup is not required; Google Search ignores llms.txt. Existing llms.txt can remain a convenience, but is not a ranking deliverable. Access and valid markup do not guarantee indexing, rankings, traffic, or AI citations.

- https://developers.google.com/search/docs/fundamentals/ai-optimization-guide

Google's updates record the retirement of FAQ rich results on May 7, 2026, with the FAQ documentation removed June 15. Keep useful visible questions and answers; do not sell FAQ markup as a Google rich-result benefit.

- https://developers.google.com/search/updates

Bing's AI Performance reporting can provide citation/grounding information; this is distinct from clicks and qualified leads.

- https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/

## Next checks requiring owner access or approval

1. In Search Console/Bing Webmaster Tools, inspect representative English/Spanish landing, area, and guide URLs; confirm indexability and selected canonicals, submit the existing sitemap, and record baseline qualified organic inquiries alongside clicks/impressions. No account-level search analytics were available for this review.
2. Verify the actual eligible business/profile details with Nathanael before adding any Google Business Profile link, opening hours, public office address, reviews, or more service locations. No invented local-business details were added.
3. Improve key seller pages using Nathanael's factual first-hand examples, clear direct-purchase versus agency roles, and sourced local process details. Do not generate dozens of near-identical neighborhood pages or fabricate transactions/testimonials.
4. Validate deployment headers, redirects, canonical URLs, schema, sitemap, and mobile layouts after an approved preview/deployment. Do not send a live test lead from a preview sharing production integrations. Run approved local mock tests instead.
5. Review utility-page indexing separately: robots blocking can prevent a crawler from reading noindex. Noindex is not access control; confidential data must never rely on robots alone. This draft only repairs rule parity, not the site's private-resource policy.

## Verification at implementation handoff

`npm run build`: 69 pages. `npm test`: 87 passed, zero failed at handoff. No commit, push, deployment, Search Console submission, profile changes, or live lead submission was performed by the search-review worker. Final integration and mobile preview review remain with the coordinating implementation worker.

Coordinator integration check: 88 tests passed with a cleared environment; build
produced 69 pages and `git diff --check` passed. Mobile screenshot verification
remains pending: the available remote browser has no viewport-resize capability
and could not reach the executor's isolated local preview (connection refused).
This is not a mobile visual pass. Review 320px/375px English and Spanish before merge.
