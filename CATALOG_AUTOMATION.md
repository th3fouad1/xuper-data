# Catalog updates

The workflow runs daily at 04:37 UTC and can be run manually from Actions.
GitHub schedules are best effort and may be delayed. Scheduled workflows in inactive
public repositories can be disabled by GitHub; check Actions periodically.

## One-time setup

1. Create a TMDB account and request API access in https://www.themoviedb.org/settings/api.
2. Copy the **API Read Access Token** (not the v3 API key).
3. In this repository: Settings → Secrets and variables → Actions → New repository secret.
   Name it `TMDB_READ_TOKEN`. Never commit the token to a file.
4. Actions → Update movie and series catalog → Run workflow.
5. Verify a successful run and the new catalog commit. Until the secret is set,
   the updater fails clearly and leaves the published catalog unchanged.

The updater selects weekly trending movies/TV, now-playing movies and on-air TV,
fetches details, seasons/episodes and the first ten credited actors per title.
It preserves existing entries, IDs, manual enabled/featured flags and unknown fields.
It refreshes trending in provider rank order and includes both `mixed` and `trending`
for existing clients. This adds metadata and trailers, not streaming video files.

All fetches and validation must succeed before writing. GitHub publishes the four
files in one commit. Concurrent remote edits cause push failure, never a force push.
Local checks: `node --test scripts/update-catalog.test.mjs`.
Run with a token in the environment: `node scripts/update-catalog.mjs`.
Use TMDB attribution in the application according to TMDB API terms.
