# Episode locking

An episode run owns `episodes/<id>/run.lock.json` until it finishes. New records contain
the PID, hostname, start time and a random ownership token. Legacy records without a
token remain readable. A live owner blocks another run, including one in the same
process. A foreign hostname is treated as live; only `ESRCH` proves a local owner dead.

Acquisition reads the previous bytes and uses `AssetStore.compareAndSwap` to replace
exactly those bytes. If another contender changed them, the run reads again rather
than overwriting the winner. Release conditionally replaces its own complete record
with JSON `null`. An old or repeated release cannot clear a newer generation, even
when both generations have the same PID. Contention retries are bounded.

The storage implementations use different atomic primitives:

- **Local filesystem:** a short `node:sqlite` `BEGIN IMMEDIATE` transaction serializes
  the byte comparison and atomic file rename across processes. There is no `await`
  inside the transaction. The `.store-cas.sqlite` sidecar holds no episode or media
  records, is hidden from asset listings, and cannot be accessed as an asset key.
  OS-managed database locks are released when a process exits. SQLite's connection
  timeout is five seconds; filesystem or database failures propagate.
- **S3:** the object is read with its ETag. The conditional write uses `If-Match` for
  existing objects and `If-None-Match: *` for absent ones. Conditional conflicts are
  returned as failed comparisons. The implementation never retries unconditionally.
  The configured S3-compatible endpoint must implement these conditions correctly.

Malformed lock records, unknown read/liveness errors and stores without conditional
write support prevent acquisition. They are not interpreted as an absent owner.
All writers must use this protocol; it cannot fence an older running application
that still writes lock files unconditionally. The local sidecar and lock records
must not be deleted while producers are running.

Local concurrency, delayed release, error handling and process-exit recovery are
covered by deterministic tests. S3 tests simulate the SDK boundary and assert the
conditional headers and conflict behavior; they do not certify a deployed endpoint.

References: [Node SQLite API](https://nodejs.org/api/sqlite.html),
[S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).
