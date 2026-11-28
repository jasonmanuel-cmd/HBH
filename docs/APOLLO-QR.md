# Apollo QR operator guide
The QR always encodes https://callharbison.com/go/apollo. Changing Apollo settings never changes the printed QR.

## Use
1. Sign in at https://www.callharbison.com/hq and open **Apollo QR**.
2. Paste a YouTube video URL or a public HTTPS URL approved by the site owner in **QR destination**. Leave blank to show the Apollo page. To instead show a walkthrough on that page, paste the video's YouTube URL in the walkthrough field.
3. Select **Save Apollo settings**. Open the permanent QR link to check, then scan a proof on a real phone before printing. Clearing both fields restores the original concept.
4. If prompted that someone else saved first, reload the settings before editing again. HQ display names are stored as audit labels, not verified identities.

## Deployment
Use separate isolated Neon databases/credentials for preview and production. Run `migrations/apollo.sql` in the intended database and grant the Apollo runtime role only CONNECT to that database, USAGE on the `apollo` schema, and SELECT/INSERT on `apollo.revisions`. Do not reuse the CRM database connection. Set sensitive `APOLLO_DATABASE_URL` in the matching Vercel environment. Put additional reviewed, exact public URLs in `APOLLO_APPROVED_URLS` separated by whitespace (no query strings or fragments). If disabled/unavailable, the public route shows the original concept and HQ blocks saves. Existing HQ members may edit Apollo; the feature grants no new HQ access to anyone. A record-level personal login is not provided by shared HQ credentials.

To roll back a bad destination, sign in and clear the destination field or save the last approved URL as another revision. To roll back the application, use the prior verified deployment; prior releases may not expose the QR at all. Do not remove the Apollo history just to roll back a destination.
