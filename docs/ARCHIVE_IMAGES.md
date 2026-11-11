# Archive image inserts

Studio's Shots tab can search real image collections, select an image for one shot, inspect its source page and restore the original shot. The original generated image, vector plan and clip remain available. These are explicit editorial choices; archive search does not automatically replace an episode's style or decide whether an image proves the narration.

## Collection adapters

- [Art Institute of Chicago API](https://api.artic.edu/docs/): public-domain artwork records with a valid image identifier.
- [Cleveland Museum of Art Open Access API](https://openaccess-api.clevelandart.org/): records with images and a CC0 collection flag; source links use the accession number.
- [NASA Image and Video Library API](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf): image records, with their published creator/center, date and source-page URL.

Each query requests at most four records from each official API. Successful results are cached for 24 hours. A provider failure is shown separately from an empty result and is retried on the next search. A malformed success payload is also treated as a provider failure. Search terms are sent to these public collection APIs; English terms usually match their metadata better.

Collection metadata is stored under `library/archive/items/`. Candidate identifiers include the normalized metadata and image identity, so an updated attribution creates a new candidate rather than changing the record behind an existing selection.

## Local images

Preview and selection use the same ingestion function and cache. It accepts a previously discovered identifier, not an arbitrary browser-supplied URL. Requests use the collection's image host, identify the application and retain the source-page referrer. Redirects are refused. Metadata responses are limited to 4 MiB, image downloads to 16 MiB and decoded images to 40 million pixels, with 20-second network timeouts.

Images are orientation-corrected, resized inside 1920 × 1920 without enlargement and normalized to JPEG. Their original byte hash, normalized asset key, dimensions, download time and source metadata are retained. This is local image preparation, not model generation. The existing media gateway remains the boundary for generation calls.

## Rendering and restoration

An archive insert becomes a `still_motion` timeline visual with `fit: contain`, no procedural ambience and no camera zoom. It is not sent to an image-to-video model. The complete photograph or document remains visible, including its aspect ratio. The other shots retain their original rendering mode.

Changing or removing a selection invalidates timeline/render and later stages and reopens the existing preview approval. It does not discard generated frames, clips or vector plans. Restoring the original shot removes only the archive override. Archive-aware review context identifies the image as a deliberate documentary insert rather than requiring it to imitate illustrated characters.

Explicit redraw removes the selected shot's archive override; scene replanning removes overrides in that scene. A successful full shot-plan replacement clears prior overrides because reused shot ids may now describe different content. Cached images and the provenance of an existing export remain available.

## Source register

The successful main render freezes its actual archive sources into `state.render.archiveSources` and writes `<episode-id>.sources.json` next to the MP4. Pending edits do not rewrite the credits for the video already on disk. The packaging stage appends deduplicated source titles, creators, dates and source-page links to the description without asking a model to reconstruct them.

The overview displays sources used in the successful main export and offers a JSON download through `/api/episodes/<id>/sources`. Reference-only research images and unselected search results are not credited as footage. The source register describes provenance; search relevance and factual editorial fit still require review.

## Verification fixture

```powershell
pnpm.cmd exec tsx scripts/preview-archive.ts
```

This uses an isolated store under `out/archive-workflow`, searches NASA for an Apollo 11 image, imports it, preserves an original fixture frame and runs the actual timeline and render stages. It writes a four-second verification MP4, a still, the source register and a verification JSON record. It does not call a model or generate paid media and does not alter existing episodes.

This is native, editable Remotion timeline/media output. No HyperFrames project or automatic external-engine production is introduced. The installed media-use runbook informed local staging and provenance practices.
