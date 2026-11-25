# IndexNow for CallHarbison.com

The static build publishes the existing root verification file and a URL-to-hash manifest. The manifest includes canonical, indexable English and Spanish pages from the public page inventory. Hashes use readable main content, image descriptions, titles, meta descriptions and structured data. Asset fingerprints, analytics, consent scripts and deployment IDs do not trigger resubmissions.

GitHub Actions runs after a successful Vercel Production deployment. It reads the manifest from the canonical production domain. An hourly run reconciles missed events or promotions. The first run submits the eligible public inventory once to initialize the checkpoint. Later runs submit new and changed URLs and verify removals with a live HTTP 404 or 410. A URL now serving an excluded page or a redirect is dropped from the checkpoint without submission.

The workflow serializes runs and keeps the last acknowledged manifest on the dedicated `indexnow-state` Git branch. Preserve that branch across deployments. The key must return HTTP 200 with the exact expected contents before a submission. HTTP 200 and 202 advance the checkpoint. HTTP 400, 403 and 422 fail visibly. HTTP 429, server errors and transient transport failures use up to three attempts. A Retry-After longer than 30 seconds defers retry to a later run. If a runner fails after the endpoint acknowledges a batch and before writing its checkpoint, a later run can resend that batch.

Check the GitHub Actions **IndexNow** log for URL counts and HTTP status. A manual run from main reads production and uses the same checkpoint. IndexNow acceptance confirms receipt or pending key validation. Search engines decide whether to index a URL.

To pause notifications, disable the IndexNow workflow in GitHub Actions. Keep the key file and state branch so that re-enabling can resume from the last acknowledged manifest.
