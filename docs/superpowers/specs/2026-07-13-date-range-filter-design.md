# Dashboard Date Range Filter Design

## Goal

Add a compact date range control directly below the dashboard header. The
selected range filters every dashboard view backed by request data:

- token metric cards
- provider and model breakdowns
- usage anomalies
- usage chart
- paginated request log

The initial range is the current calendar day in the browser's local timezone.

## UI

Use two native `input[type="date"]` controls labelled `From` and `To`. No date
picker dependency is needed. The end date is inclusive from the user's point of
view.

Changing either valid date applies the range immediately, resets request-log
pagination to page one, and restarts the existing passive refresh interval with
the new range. The `From` input cannot be later than `To`, and `To` cannot be
earlier than `From`.

The controls reuse the dashboard's existing dark input styling and remain
usable on narrow screens.

## Date Semantics

The browser converts the selected local dates into a half-open UTC interval:

```text
[local start date at 00:00, day after local end date at 00:00)
```

It sends both boundaries as ISO timestamps. This includes the full selected end
date without relying on `23:59:59.999`, and it remains correct across daylight
saving transitions.

SQLite already stores `created_at` as UTC ISO text. Queries therefore filter
with `created_at >= from AND created_at < to` using prepared parameters.

## Data Flow

The dashboard sends the same `from` and `to` query parameters to:

- `GET /api/summary`
- `GET /api/usage-chart`
- `GET /api/requests`

The summary applies the range to totals, current-session totals, provider
groups, and model groups. The request route combines the range with its existing
cursor condition. The chart uses the same range and UTC minute buckets so its
results do not depend on the server or container timezone.

The range parameters remain optional for direct API callers. With neither
parameter, each endpoint keeps its current behavior. With a range, both must be
present; a one-sided range, malformed timestamp, or `from >= to` returns HTTP
400. The dashboard always supplies a valid pair.

Add an index on `requests(created_at)` because these filtered queries run during
the existing two-second polling cycle.

## Error Handling

Native `min` and `max` constraints prevent an inverted range in normal UI use.
The API still validates the trust boundary.

Settings, clear-log, and request-detail endpoints are unchanged. Existing
uncommitted modal and payload-layout edits in `frontend/app/page.tsx` must be
preserved.

## Verification

Add focused Node tests that:

- include a request at the lower boundary and exclude it at the upper boundary
- confirm summary, request list, and chart use the same range
- reject one-sided, malformed, and inverted API ranges

Run the frontend test suite and production build. No UI test framework or new
runtime dependency is introduced.

## Out of Scope

- time-of-day selection
- URL or local-storage persistence of the selected range
- presets such as "last 7 days"
- a combined dashboard API
- unrelated dashboard or modal refactoring
