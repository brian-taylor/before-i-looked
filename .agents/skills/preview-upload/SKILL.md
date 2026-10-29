---
name: preview-upload
description: Save a rig page as one HTML file and put it on the public preview link (GitHub Pages, repo brian-taylor/rig-previews), or upload it again without the lane marker. Use for a plan's "Preview for review" and "Clean up" sections.
---

# preview-upload

Previews never go in this repo (ADR 0003). They live in a separate public repo,
`brian-taylor/rig-previews`, served by GitHub Pages from `main` at
`https://brian-taylor.github.io/rig-previews/<path>.html`. It has a `.nojekyll` file.

Ask the human before every upload: what, why, where, who can see it, how to undo it.

## Save the page

```sh
pnpm start                                    # with LANE_MARKER set in .env
curl -sf localhost:8787/digest/<night> -o <previews>/digest/<night>.html
```

Without the marker, for the clean-up (env beats `.env`, empty means unset):

```sh
LANE_MARKER= PORT=8788 pnpm start
curl -sf localhost:8788/digest/<night> -o <previews>/digest/<night>.html
```

Check: `grep '<span class="marker">'` shows the marker, or "no marker set".

## Upload

First upload: commit and push to `rig-previews` `main`. Re-upload without the marker: amend
that commit and force-push (with the human's yes), so the marker isn't left in the public
history either. Pages takes about 15–60 s. Poll the link until the new banner shows, before
you send it or report it done.

## Undo

`gh repo delete brian-taylor/rig-previews` takes every preview down.
