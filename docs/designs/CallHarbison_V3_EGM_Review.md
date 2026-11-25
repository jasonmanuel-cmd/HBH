# CallHarbison.com — Master Conversion & Revenue Blueprint V3

Draft | November 25, 2026

## 01 / Executive strategy

The objective is not maximum form submissions. It is maximum sustainable contribution from qualified property opportunities, while preserving seller choice and regulatory compliance.
The original audit diagnoses a trust and friction problem. V2 adds delivery gates, search strategy and compliance. V3 extends the business model: the visitor may be a direct-sale seller, listing client, renovation prospect, development prospect, future seller, referral or investor. Each path needs a responsible owner and a commercially viable outcome.
The strategic position: own the property decision, not just the transaction. Help homeowners compare realistic options rather than forcing them into a cash-sale funnel. Cash-offer intent remains prominent where relevant; the alternative decision path is secondary and progressively disclosed.
### Decision hierarchy
1. Protect existing lead delivery and recover failures. 2. Remove unnecessary friction. 3. Establish verified trust. 4. Create decision tools. 5. Route opportunities. 6. Measure actual contribution. 7. Scale only proven channels.
### Evidence boundary
Source A is the original conversion audit; source B is the supplied 15-page V2 blueprint dated November 25, 2026. Both are reproduced in the appendices. This V3 synthesis adds proposed requirements and a structured challenge review. No fresh production database, repository, analytics, carrier approval, legal sign-off or financial results were independently verified in this document. Historical audit findings are not proof of current production behavior.

## 02 / Customer psychology and positioning

The seller needs clarity, safety, relevance, an understandable estimate of proceeds, low effort and control over the next step. Address those needs without using distress, urgency or fear as pressure tactics.
### Homepage message
Search-oriented headline: Sell Your Bakersfield House As-Is. Get a Cash Offer & Real Options. Avoid implying guaranteed eligibility, a guaranteed fair price or a binding offer. Supporting line: Compare a direct sale with listing or other available options before deciding. Identify the actual licensed professional and broker only after verification.
Primary action: Get My Cash Offer. Secondary action: Explore My Options or contact the team; test the hierarchy rather than placing equal-weight buttons everywhere. Move investor inquiries to a dedicated page, accessible in navigation and footer.
### Page sequence
Compact mobile hero; trust strip and real agent portrait; clear start action; situation selector; verified proof; process explanation; proceeds comparison; FAQs; final CTA. Use actual local property photos, not generic stock where genuine media is available. Preserve navy and gold identity, existing URLs, accessibility and responsive behavior.
### Trust at the point of action
Explain who will contact the seller, what information is collected, how it is used, when a response can actually occur, and that requesting a review creates no obligation. Explain direct-buyer conflicts near the form. Do not promise a written offer for properties that may be ineligible. Publish a response window only after the owner agrees to staffing it.

## 03 / Lead capture and mobile experience

Start with the smallest meaningful commitment. Keep a short address-first form as the initial control if already implemented; compare against situation-first when sufficient evidence exists. Address autocomplete must permit manual entry and accessible keyboard navigation. Do not force a precise address on visitors who only want educational information.
### Capture paths
Cash offer request: property location, situation, name, preferred contact method and appropriate consent. Optional email; optional details after successful submission. Information-only visitors can use calculators or read guides without surrendering contact details. Call and text actions should be clearly labeled; clicks are intent signals, not completed conversations.
Remove mandatory source attribution. Capture campaign parameters and landing page under applicable privacy controls; make self-reported source optional after submission. Separate request-related communication from marketing permissions. Do not persist abandoned raw addresses merely for analytics; use anonymous step events where possible.
### Mobile acceptance criteria
At 320, 360, 390 and 430 CSS pixels, no horizontal overflow, hidden controls, keyboard obstruction or overlapping sticky bars. Verify real iOS and Android devices, browser back/forward, focus order, manual address entry, slow network, duplicate taps and retry. Preserve valid entered values when recoverable without leaking data. On confirmation show next steps, actual response window, optional scheduling and optional property details. Never return a success message before durable storage.

## 04 / Fifteen strategic additions

### 1. Property decision engine
Offer an ungated, deterministic situation selector. Ask about owner goals, condition and timing. Return educational paths, not definitive legal or financial advice. Record only consented lead information.
### 2. Personalized options report
Create a shareable human-reviewed report comparing possible net proceeds, time, assumptions, costs and contingencies. Date and version each report; clearly distinguish estimates from offers.
### 3. Cost of waiting calculator
Compare taxes, insurance, maintenance, interest and other holding costs against potential benefits of waiting. Avoid counting mortgage principal twice when the payoff changes. Display uncertainty and editable inputs.
### 4. Existing offer second opinion
Dedicated intake for homeowners who already have an offer. Explain contingencies, fees, assignment terms and closing risks without asserting competitors are dishonest. Secure any uploaded documents.
### 5. Optional property photos
Post-submit only. Restrict file types and sizes, scan uploads, remove unnecessary metadata, enforce access and retention, and avoid public URLs.
### 6. Family decision sharing
Initially use an owner-approved, redacted report. Defer portal accounts until usage justifies them. Never assume a family member has legal authority to act.
### 7. Anonymous question assistant
Ground answers in approved educational content. Disclose automation, refuse binding valuations, avoid collecting private information unnecessarily, and escalate individualized matters to a qualified professional. Defer autonomous implementation until content and human support are ready.
### 8. Seller-controlled follow-up
Offer contact now, scheduled call, later follow-up or information only. Honor preferences and opt-outs across all channels.
### 9. Real property case library
Use permissioned, documented cases with situation, options, decision and outcomes. Distinguish direct acquisitions from brokerage transactions; never invent results.
### 10. Professional referral portal
Begin with a secure referral form and partner guide. Obtain appropriate seller authorization, avoid unauthorized status disclosure and obtain review of compensation arrangements.
### 11. Offline tracking
Use controlled redirect URLs for signs, mailers and cards, separate campaign codes and a stable fallback. Existing printed QR codes can only be redirected if the encoded destination is controllable.
### 12. Property intelligence
Enrich submitted leads only with authorized public or licensed data. Record source, date and confidence; require human confirmation. Defer paid feeds until the business case is proven.
### 13. Lead recovery
Monitor missed acknowledgements, failed alerts, overdue follow-ups and missed appointments. Escalate internally; do not automatically contact customers without appropriate permissions.
### 14. Revenue attribution
Connect channel and campaign to qualified opportunity, closed deal and actual contribution. Avoid treating contracted revenue as collected revenue.
### 15. Competitor comparison resource
Publish an objective buyer-evaluation guide covering written terms, proof of funds, escrow, contingencies, fees and relevant licensing. Keep statements verifiable and avoid unsupported rankings.

## 05 / Opportunity routing and CRM

Use one coherent lead record and multiple opportunity types; do not create duplicate customer records for every service. The primary pipeline is seller acquisition. Other pathways are offered only when relevant, authorized and operationally supported.
### Routing matrix
Direct purchase: acquisition owner; property review and underwriting; outcome = accepted or declined offer / closed acquisition. Listing: licensed brokerage owner; consultation and net sheet; outcome = listing agreement / closed sale. Renovation: authorized contractor; scope review and estimate; outcome = signed project / completed work. Development: qualified development owner; feasibility and parcel review; outcome = approved project or referral. Second opinion: licensed reviewer; compare written offer; outcome = documented consultation. Future seller: assigned follow-up owner; permitted contact schedule; outcome = reactivated opportunity or opt-out. Referral: approved partner contact; authorized introduction; outcome = acknowledged referral. Investor: separate pipeline; preferences and qualification; outcome = matched opportunity.
### Data model
Lead: UUID, created_at, source, landing page, consent reference, contact preference, language, test flag, dedupe key. Opportunity: UUID, lead_id, type, owner_id, stage, next_action_at, response deadline, lost_reason, estimated and realized contribution. Consent: purpose, channel, text version, timestamp, revocation status. Event: unique event ID, lead/opportunity ID, actor, event type, timestamp. Notification outbox: event ID, recipient role, attempts, next_attempt_at, status, last_error.
Keep Harbison, Aspen II and other client projects appropriately separated. Any cross-business introduction needs authority and applicable disclosure; never silently share customer data.

## 06 / Reliability architecture and Neon migration

Website -> validated request -> durable database transaction -> lead plus outbox -> CRM synchronization and alert worker -> owner acknowledgement -> opportunity tracking.
### Engineering requirements
Inspect actual HBH repository and deployment configuration. Confirm the canonical lead store and current migration status before changing anything. If migrating Supabase to Neon, inventory schema, indexes, constraints, RLS equivalents, auth/storage dependencies, connection pooling, environment variables, existing records and integrations. Do not assume a PostgreSQL migration automatically replaces Supabase auth or storage.
Use server-side validation, bounded payloads, rate limits, unique idempotency keys, transactional writes, retries with backoff, dead-letter handling, restricted logs and least-privilege credentials. Return success only after commit; notification failures must be recoverable without duplicating leads. Reconcile CRM and database records and record owner acknowledgement separately from provider delivery.
### Release gate
Use an isolated test destination and is_test flag. Verify stored row, outbox entry, alert receipt and acknowledgement; ensure reporting and real customer outreach exclude test records. Test database outage, timeout after commit, double submission, notification provider failure, worker restart and replay. Confirm backup restoration in a nonproduction environment. Daily synthetic monitoring should alert through an independent channel. Seven days of successful monitoring is a proposed stability signal, not proof of perfect reliability.
Rollback: retain verified previous configuration, migration backup and deployment version; document cutover and reconciliation procedure. Never delete the original store until authorized and recovery is proven.

## 07 / Search, local authority and distribution

Choose CallHarbison.com as the proposed canonical seller domain, subject to owner approval. Inventory legacy domains and map equivalent URLs before redirects; preserve distinct business purposes, backlinks and useful content. Verify broker name, license, business name, phone and address/service area before updating listings.
### Intent hubs
Sell fast, cash buyers, inherited property, repairs, tenant-occupied property and relocation. Hold foreclosure/default-related marketing until qualified legal review. Each page should answer real local questions, give unique evidence, explain limitations and link to an appropriate next action. Spanish content requires fluent review and a real Spanish-language response path.
### Technical SEO
Check crawlability, canonical tags, redirects, sitemap accuracy, unique titles, descriptive headings, accessible images, internal links and real-user performance. Core Web Vitals targets: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 at the 75th percentile. Use only accurate visible structured data and validate it. Do not expect self-serving business review markup to produce review stars.
### AEO / GEO
Use answer-first explanations, sourced facts, named authors, verified credentials, original case studies and consistent entity details. No special AI markup guarantees inclusion. llms.txt is optional, not a Google ranking requirement. Track target questions, platform/date, accuracy of mention, referral visits and actual qualified opportunities. Avoid mass-produced thin city pages.
### Distribution
Prioritize existing local network, consented referrals, genuine Google Business Profile activity, case-based educational videos, QR campaigns and intent pages. Paid tests should have a capped budget, reliable attribution and stop criteria. Ten reviews is an aspirational proof target, not a universal advertising prerequisite.

## 08 / Decision tools and unit economics

### Illustrative proceeds example
Market sale price $350,000; cash offer $270,000; mortgage payoff $150,000; cash closing costs $2,000; listing repairs $25,000; listing fees/costs 6% ($21,000); holding costs $1,800/month for three months ($5,400). Cash net = $118,000. Listing net = $148,600. Difference = $30,600 in favor of listing under these assumptions. Neither amount is a valuation or actual offer. Use a timeline-adjusted payoff; exclude principal from holding costs if already reflected in payoff. Include taxes, liens, concessions and contingency scenarios when known.
### Profit model
Expected deals = visitors x visit-to-lead rate x qualification rate x qualified-to-close rate. Expected contribution = sum of expected closed deals by type x contribution per type, minus incremental channel and system costs. Contribution per deal must subtract deal-specific costs; include labor, overhead and financing in the appropriate cost buckets without double counting.
Example: 1,000 visits x 3% x 50% x 10% = 1.5 expected deals. At $10,000 contribution per deal and $2,000 monthly costs, expected contribution is $13,000. This is a hypothetical expected value, not a forecast. Initial funnel 2%/50%/10% = 1 deal; improved website 4%/50%/10% = 2; improved sales 4%/60%/15% = 3.6; fully optimized scenario 6%/60%/15% = 5.4. Results depend on actual lead quality, capacity, cash flow and transaction lag.
### Decision rule
Rank opportunities by expected incremental contribution, implementation cost, uncertainty and operational capacity. Track actual cash receipts and costs by cohort; do not scale based solely on low cost per lead.

## 09 / Measurement and experimentation

Track unique eligible sessions, form starts, step completions, stored submissions, phone/text intent, actual conversations, qualified opportunities, appointments, offers, contracts, closings, realized margin and lost reasons. Define each event and denominator. Deduplicate using stable IDs; exclude synthetic traffic. Track median and 90th-percentile response time, acknowledgement rate and unresolved lead age.
### Baseline and testing
Capture 2-4 weeks of baseline if feasible; fix verified defects immediately rather than waiting. At low traffic use sequential changes and qualitative feedback, acknowledging seasonality and channel-mix confounding. For randomized tests calculate required sample size using baseline conversion, minimum detectable effect and desired power; do not assume 100 conversions per variant suffices.
### Experiment queue
1. Remove investor distraction and unnecessary attribution field (separate releases if attribution of effect matters). 2. Real portrait and verified proof. 3. Address-first vs situation-first. 4. Mobile contact hierarchy. 5. CTA language. 6. Second-opinion entry. Primary metric: qualified opportunities per eligible visitor; downstream guardrails: appointment rate, contactability, contribution and seller complaints. Do not optimize for lead-to-appointment alone because it can improve while total opportunities decline.
### Dashboard
Daily delivery health and overdue work; weekly channel funnel and lost reasons; monthly cohort economics, search visibility and experiments. Assign an owner to each metric. Define stopping rules before paid traffic launches.

## 10 / Governance, legal and privacy gates

This document is a proposed operational design, not legal advice. Obtain broker approval for branding, advertising, brokerage identity, license disclosures and direct-buy workflows; confirm current facts instead of trusting historical references. Obtain California real estate attorney review for direct acquisition conflicts, equity-purchaser or foreclosure-related rules, and any regulated referral or compensation arrangement.
Keep automated SMS and missed-call text-back disabled until required carrier registration and applicable consent requirements are verified. Carrier approval is not a substitute for legal compliance. Honor opt-outs and contact preferences. Do not activate live outbound campaigns or contact test records.
Maintain purpose-specific consent history, access control, retention/deletion policies, secure file handling and data minimization. Avoid unconsented partial-form outreach and avoid retaining identifiable abandoned fields by default. Do not send property documents or sensitive data into advertising platforms or third-party AI systems without appropriate authorization.
Use verified proof, no invented transactions, reviews, urgency or guarantees. Review advertising and routing for fair housing and nondiscrimination; do not use protected characteristics or proxies in lead scoring. Publish accessible content and ensure a human escalation path.

## 11 / Implementation and commercial scope

### Phase 0: days 1-2 (proposed)
Delivery verification, schema/migration inventory, test isolation, outbox/retry checks, monitoring, owner confirmation. Gate: durable lead, received alert and acknowledged ownership demonstrated; rollback documented.
### Phase 1: days 3-7
Mobile hero, investor relocation, attribution removal, form clarity, proof assets and confirmation page. Gate: accessibility, mobile, regression and delivery checks pass. Collect written response hours and broker decisions in parallel.
### Phase 2: days 8-14
Enhance existing estimator, second-opinion page, lightweight situation routing and human-reviewed options report. Gate: named owners, accurate formulas, explicit limitations and verified workflow. Defer large portal and AI projects.
### Phase 3: days 15-30
Verified cases and reviews, Spanish QA, referral intake, entity correction and local intent pages. Gate: permissioned assets and applicable approvals. No production changes to regulated pages before approval.
### Phase 4: days 31-90
Measure cohorts, test changes, expand proven channels, assess enrichment and portal demand. Gate: positive economics under realistic assumptions and operational capacity.
### COAI scope protection
Proposed prices, not existing obligations: maintenance $100-200/month; initial CRO sprint $750-1,250; decision tools $1,500-3,000; CRM reliability $750-1,500; ongoing optimization $400-800/month; managed growth $1,000-1,500+/month. Clarify overlap, acceptance criteria, ownership, payment milestones, third-party costs and exclusions before work. Do not automatically bundle revenue operations into hosting.

## 12 / Elephant-Goldfish challenge review

Review status: manual EGM-inspired challenge pass, not a native independent-agent run. The official repository describes contextual drafting and fresh-context critique; the current execution environment has no verified native EGM reviewer session. No claim of independent reviewer approval is made.
### Critical findings and dispositions
EG-01 Delivery unknown: V2 documents an earlier failed submission and unconfirmed migration. Disposition: block conversion deployment until storage, alert and acknowledgement evidence exists. Status: open, production evidence required.
EG-02 Conflicting primary CTA: V3 concept includes multiple paths while V2 wants a single hero job. Disposition: keep primary cash CTA for relevant intent and progressively disclose options. Status: design resolved; test pending.
EG-03 Privacy: V2 permits partial-form analytics storage. Disposition: anonymous event telemetry by default; no identifiable abandoned addresses or outreach. Status: design resolved; code verification pending.
EG-04 Misleading estimates: payoff/holding cost can double count principal and offer eligibility is unknown. Disposition: timeline-adjusted payoff and explicit assumptions, human review. Status: design resolved; implementation pending.
EG-05 Unproven revenue paths: renovation and development capacity, licensing and revenue sharing not verified. Disposition: gate each path behind written owner and broker approval. Status: open.
EG-06 Low traffic: fixed A/B threshold and lead-to-appointment alone are inadequate. Disposition: power calculation, qualified opportunities per visit and downstream contribution. Status: design resolved; baseline missing.
EG-07 Scope inflation: advanced portals, AI and data feeds may absorb resources before revenue. Disposition: stage-gate and defer until measured demand. Status: design resolved.
EG-08 Compliance: broker identity, direct-buy conflicts, foreclosure and texting approvals unverified. Disposition: hold affected flows pending qualified review. Status: open.
EG-09 Cross-project risk: shared CRM or migrations could leak data or break unrelated projects. Disposition: repository isolation, separate credentials/access, authorized introductions only. Status: code verification pending.
EG-10 Monitoring false confidence: successful HTTP or alert provider response does not establish human ownership. Disposition: acknowledgement, reconciliation and independent failure alert. Status: implementation pending.
EG-11 Search assumptions: AI-specific markup, self-serving stars and domain consolidation are not guaranteed wins. Disposition: official documentation, URL inventory, evidence-led optimization. Status: verify during implementation.
EG-12 Financial model: hypothetical margins and deal rates cannot validate investment. Disposition: cohort-level realized contribution and capped spend. Status: data missing.
### Review conclusion
Conditionally suitable as a draft for owner approval; not approved for production or paid scaling. Open blockers remain. A native EGM run should independently review the Markdown specification against the actual repository and approved requirements.

## 13 / Codex handoff and native EGM workflow

Open the HBH repository in Codex. Install the official plugin using the documented CLI commands:
`codex plugin marketplace add google/elephant-goldfish-model`
`codex plugin add egm@egm`
Restart the session. Place the companion Markdown file in docs/designs/ and select the EGM review skill from the Codex skill picker. For broader business-document critique, select the EGM review-loop skill and configure reviewers. Fresh-context subagents are required; if unavailable, report that the native run cannot proceed. Use the drift-report skill against existing design docs after implementation. Official source: https://github.com/google/elephant-goldfish-model (checked November 25, 2026).
### Master execution prompt
Act as a senior CRO engineer, reliability engineer, technical SEO specialist, real estate systems architect and revenue operations analyst. Read this specification, original audit and V2. Inspect the current HBH repository and production evidence before proposing implementation. Treat all historical findings as hypotheses until verified. Preserve working functionality, branding, URLs and project isolation. Do not fabricate proof, deploy unapproved regulated workflows, contact real customers in tests, expose secrets or move unrelated project data.
First run a fresh-context design review covering architecture, reliability, UX/accessibility, privacy/compliance, testability and economic assumptions. Record every finding with severity, evidence, proposed resolution and owner. Resolve disagreements with the user; do not treat silence as approval. Produce a revised specification and a traceability matrix linking requirements to code and tests. Then implement only approved phases in small reversible changes. For every change report files, dependencies, test results, rollback and success metric. Confirm delivery before CRO deployment. No claim of success without evidence. Return statuses: verified, implemented but untested, blocked, failed or deferred. No live outbound contact or paid scaling without explicit authorization.
### Reference and verification checklist
Sources: original supplied conversion audit (Appendix B); Master Conversion Blueprint V2 (Appendix A); official EGM repository above. For implementation consult Google Search Central documentation at developers.google.com/search, Google Ads documentation at support.google.com/google-ads, and applicable California DRE materials at dre.ca.gov. These are verification destinations, not evidence that the current site meets their requirements.