# Studio read behavior

An episode detail request reads the ledger once. Episode media spend, Claude cost,
stage/provider breakdowns and provider latency estimates use that same snapshot.
Provider latency still uses entries from every episode; spend and breakdowns use
only the requested episode. Cached calls and Claude calls stay outside the media
budget, and billed failures remain included.

Studio list consumers call `EpisodeRepo.list({ includeTimeline: false })`. The repo
reads at most four state files concurrently and discards each timeline before
retaining that list result. Default repo listings and individual loads continue to
return complete state, and stored timelines are unchanged. This reduces concurrent
read pressure and retained SVG data; it does not add a persistent summary index or
avoid reading each state file. Unreadable entries are skipped as before.

The episode view schedules its next poll after the previous one settles: 1.5 seconds
while running, five seconds otherwise. Requests time out after 30 seconds. A new
refresh aborts the previous GET and its generation number prevents a late response
from replacing newer data, even when a transport ignores cancellation. Changing
episodes or unmounting invalidates and aborts the pending GET. Network failures are
retried on the next poll. Action POST requests are not part of GET cancellation.

Regression tests use deferred responses, fake timers and read-count assertions.
The fixed listing fixture contains 12 states with 256 KB of SVG data each; its
accepted concurrency limit is four and its lightweight result retains no timeline.
No wall-clock speedup or deployed-server latency is claimed from these fixtures.
