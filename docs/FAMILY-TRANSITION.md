# Family Property Transition — Operator Runbook

Page: `/sell-parents-house` · Partner short link: `/family?ref=<slug>` · Printable leave-behind: `/family-property-guide` (noindex)

## 1. Database (Supabase)
1. Run `supabase/schema.sql` (if not already), then `supabase/migrations/002_family_transition.sql`.
2. Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in Vercel. If 002 hasn't run, the API still saves core fields and logs a warning.
3. Views: `v_funnel`, `v_cost_per_stage`, `v_partner_results`, `v_uncontacted`. Enter monthly spend in `ad_spend`.

## 2. Partner links
Each partner gets `callharbison.com/family?ref=<slug>` (slugs seeded in `partners`). The site converts `ref` into
`utm_source=<slug>&utm_medium=referral&utm_campaign=family_transition`, stores it 90 days, and the lead lands with `channel=partner`.
**Resource relationships only — no per-referral payments** without California real-estate counsel / broker sign-off (DRE unlicensed-compensation rules, RESPA, and health-care anti-referral rules for care providers).

## 3. Tracking
- `GTM_ID` → container. dataLayer events emitted: `form_start`, `form_step`, `generate_lead` (with `form_type`), `call_click`, `video_play`.
- Google Ads primary conversion should be **qualified lead**, imported offline from Supabase using stored `gclid` — not raw form fills.
- First touch persists 90 days in localStorage (gclid window); last touch per session.

## 4. Speed to lead
- `TWILIO_*` + `LEAD_ALERT_SMS` → lead gets a text in seconds, staff get an alert. **A2P 10DLC registration is required first and can take 1–3 weeks — start it day 1.**
- Until Twilio is live: Resend email alert + `v_uncontacted` view.

## 5. Videos
Upload to YouTube, paste IDs into `src/family.mjs` (`heroVideo.id`, `videos[n].id`), rebuild. VideoObject schema is added automatically.

## 6. Google Ads rules (housing category)
Search only at launch. Location: Bakersfield / Kern County / radius. **No** age, gender, parental-status, or ZIP targeting; no audiences based on health, care facilities, or facility geofences.

## 7. Compliance notes baked into the page
- Direct purchase disclosure: Harbison is the buyer, not the family's agent; license disclosed in writing.
- Form asks relationship/authority; never medical info.
- Pipeline field `authority_confirmed` must be true before an offer goes out (owner, POA covering real estate, trustee, or conservator).
