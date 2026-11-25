# Phase 1: focused seller intake

Date: 2026-11-25. This branch is stacked on the Gate 0 branch and has not been deployed. Keep `ENABLE_AUTO_SMS=false` and `ENABLE_FORECLOSURE_PAGES=false`.

## Changes

- The homepage hero has one seller offer CTA, one prefilled text CTA, a licensed agent trust strip, and no investor card. Investor intake remains at `/investors` and is linked in navigation and footer.
- The options form asks for the property address first, then situation and timeline, then contact details and response consent. The Company field stays offscreen for bot filtering. First-touch UTMs and referrer are captured passively without collecting partial form entries.
- The thank-you page offers an optional source question. `/api/lead-attribution` accepts only a signed, unexpired lead reference and one allowlisted source. It confirms a database update on a non-test row; it does not rewrite the passive channel.
- `RESPONSE_PROMISE` changes the form's follow-up sentence. The default states the review sequence without a guaranteed response time.

## Release sequence

1. Finish Gate 0 public handler, alert receipt, and recovery verification before any Phase 1 production promotion.
2. Apply `supabase/migrations/20261125020000_self_reported_source.sql` to the isolated HBH production lead database after backup. Current production uses Neon; the same additive migration is required there.
3. Deploy the Phase 1 application branch, verify the English and Spanish homepage, three form steps, thank-you attribution, and an authorized test lead through the complete public handler. Confirm its row, alert receipt, and optional source write.
4. Monitor eligible seller form starts, valid submissions, storage confirmations, and owner alerts. Exclude `is_test=true` leads from every denominator and numerator.

## Verification and limits

`npm test`, `npm run build`, and `node scripts/phase1-responsive-check.mjs` are the local checks. The browser script tests widths 320, 360, 390, 430, and 1280 and the three-step interaction. The first-visit cookie choice covers part of the mobile viewport until a visitor accepts or declines; responsive measurements set the choice to declined.

No production conversion lift or live thank-you write has been measured. Gate 0 remains open pending the full public submission and alert failure/retry checks.

## Rollback

Before deployment, close the draft Phase 1 PR or reset this branch. After deployment, promote the previous known-good Vercel deployment or revert the Phase 1 application commit. Leave the additive `self_reported_source` column in place so any answers already stored are not lost. Keep Gate 0's canary migration and alert configuration intact.

Primary metric: eligible seller submissions stored and owner-alerted per form start, with step completion and source response rates as supporting measures.
