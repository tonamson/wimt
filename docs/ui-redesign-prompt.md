# Prompt: Redesign toàn bộ giao diện WIMT Token Audit

> Dùng prompt này với agent có skill **design-taste-frontend (tasteskill)**.  
> Mục tiêu: redesign UI chuyên nghiệp, dual theme light/dark, layout dashboard/devtool rõ hierarchy.  
> **Bắt buộc giữ nguyên 100% tính năng hiện có.** Không đổi product scope, API contract, hay data model trừ khi UI mới cần adapter mỏng.

---

## 0. Design Read (khai báo trước khi code)

```text
Reading this as: redesign overhaul of a local AI token-audit dashboard (devtool / cockpit)
for engineers verifying OpenAI/Anthropic-compatible proxy usage,
with a Linear / Vercel / GitHub Primer–adjacent language:
calm, high-trust, data-dense, monochrome neutrals + one restrained accent.
Not a landing page. Not marketing. Not glassmorphism AI-slop.
```

### TasteSkill dials (bắt buộc)

```text
DESIGN_VARIANCE: 3
MOTION_INTENSITY: 2
VISUAL_DENSITY: 8
```

| Dial | Value | Lý do |
|------|-------|--------|
| DESIGN_VARIANCE | 3 | Devtool cần đối xứng, predictable, scan nhanh; tránh layout “arty”. |
| MOTION_INTENSITY | 2 | Polling realtime; chỉ hover / focus / modal enter nhẹ. Không marquee, không scroll-hijack. |
| VISUAL_DENSITY | 8 | Metric + chart + table + settings trên một workspace; cockpit density. |

### Redesign mode

- **Mode:** Redesign – Overhaul (visual + layout).
- **Preserve:** toàn bộ feature, API endpoints, polling logic, SQLite schema, proxy behavior, copy voice kỹ thuật.
- **Retire:** dark-only hardcode, single-column stack “card trên card”, metric 6 ô đều nhau thiếu hierarchy, settings chiếm full width giữa metric và data, thiếu theme toggle, thiếu system-aware tokens.

---

## 1. Sản phẩm là gì (context bắt buộc)

**WIMT (Where Is My Tokens?)** là local Next.js app:

1. **AI proxy** (`/v1/*`) forward request tới OpenAI/Anthropic-compatible upstream.
2. **SQLite logging** usage (input/output/cache write/cache read/total/missing).
3. **Dashboard** để audit token theo khoảng ngày, provider, model, request log, chart trend.

Audience: developer tự host, chạy Codex/Claude CLI qua proxy local (`127.0.0.1`). UI phải cảm giác **professional ops console**, không landing SaaS.

Stack hiện tại (giữ trừ khi redesign yêu cầu token layer):

- Next.js App Router, React client page (`frontend/app/page.tsx`)
- Tailwind v4 + Geist / Geist Mono
- ApexCharts (`react-apexcharts`) cho token trend
- APIs: `/api/summary`, `/api/requests`, `/api/requests/[id]`, `/api/usage-chart`, `/api/settings`, `/api/clear`, `/api/session`

---

## 2. Inventory tính năng – PHẢI GIỮ NGUYÊN (feature parity checklist)

Agent phải tick hết trước khi coi là xong. **Không được drop feature để “gọn UI”.**

### 2.1 Header / global actions

- [ ] Brand / product name: “Where is my tokens?” + “Token audit dashboard” (có thể refine hierarchy typography, không đổi ý nghĩa)
- [ ] Nút **Refresh** – gọi lại summary + chart + requests theo date range + cursor hiện tại
- [ ] Nút **Clear logs** – confirm dialog trước khi `POST /api/clear`, reset pagination, refresh data về empty

### 2.2 Date range filter

- [ ] Input **From** (`type="date"`)
- [ ] Input **To** (`type="date"`)
- [ ] Validate: from ≤ to; không cho chọn range ngược
- [ ] Default: hôm nay (browser-local) sau hydration
- [ ] Đổi range → reset cursor stack, clear list, reload summary + chart + requests
- [ ] Query params `from` / `to` theo `localDateRange` hiện có

### 2.3 Metric strip (totals trong range)

Hiển thị 6 metrics từ `summary.totals`:

| Label | Field |
|-------|--------|
| Input | `inputTokens` |
| Output | `outputTokens` |
| Cache write | `cacheWriteTokens` |
| Cache read | `cacheReadTokens` |
| Total cache | `totalCacheTokens` |
| Total tokens | `totalTokens` |

- [ ] Format số có thousand separator (`formatNumber`)
- [ ] Mono tabular nums cho mọi số liệu

### 2.4 Proxy endpoints & upstream settings

- [ ] Hiển thị read-only proxy base URLs:
  - OpenAI/Codex: `{origin}/v1`
  - Claude/Anthropic: `{origin}`
- [ ] Input editable: `openaiUpstreamBaseUrl`
- [ ] Input editable: `anthropicUpstreamBaseUrl`
- [ ] Nút **Save** → `POST /api/settings`
- [ ] Status feedback: “Saved” / error message
- [ ] Gợi ý env export:
  - `export OPENAI_BASE_URL=.../v1`
  - `export ANTHROPIC_BASE_URL=...`
- [ ] (Optional UX improve, không bắt buộc logic mới) copy-to-clipboard cho proxy URLs

### 2.5 Provider breakdown

- [ ] Bảng `summary.byProvider` với columns:
  - Key (provider schema)
  - Requests
  - Tokens (total)
  - Write (cache write)
  - Read (cache read)
  - Cache (total cache)
  - Missing (usage missing)
- [ ] Empty state: “No provider data yet” (hoặc tương đương rõ nghĩa)

### 2.6 Usage anomalies

- [ ] Responses missing usage (`summary.totals.usageMissing`)
- [ ] Upstream errors trong page hiện tại của request log (`row.error`)
- [ ] Models observed (`summary.byModel.length`)
- **Lưu ý:** hiện UI chỉ show count models, không bắt buộc render full `byModel` table. Nếu redesign thêm model breakdown panel thì **bonus**, không thay anomalies.

### 2.7 Token trend chart

- [ ] Line chart ApexCharts theo buckets từ `/api/usage-chart`
- [ ] 6 series toggle độc lập:
  - Input, Output, Cache write, Cache read, Total cache, Total
- [ ] Checkbox/toggle visibility per metric (default all on)
- [ ] Height ~240px (có thể tinh chỉnh nếu density đẹp hơn)
- [ ] Animations off (hoặc respect reduced-motion)
- [ ] Empty chart: “No request data in selected range”
- [ ] Tooltip format time + number
- [ ] Chart theme theo light/dark (không hardcode dark-only)

### 2.8 Request log table

Columns bắt buộc:

| Column | Source |
|--------|--------|
| Time | `createdAt` |
| Session | short session id + full id on title/tooltip |
| Schema | `providerSchema` |
| Model | `model` or `-` |
| Path | `requestPath` |
| Status | `statusCode` (highlight non-200) |
| Input | `inputTokens` |
| Output | `outputTokens` |
| Cache write | `cacheWriteTokens` |
| Cache read | `cacheReadTokens` |
| Total cache | `totalCacheTokens` |
| Total | `totalTokens` |
| Latency | `latencyMs` + `ms` or `-` |

Behavior:

- [ ] Click row → fetch `/api/requests/:id` → open detail
- [ ] Cursor pagination: Previous / Next
- [ ] Page size 15
- [ ] Meta: “15 records/page · cursor page N”
- [ ] Sticky table header
- [ ] Empty: hướng dẫn point Codex/Claude CLI vào proxy URL
- [ ] Loading state khi refresh/page (không blank hard)
- [ ] Auto-refresh ~2s khi không có request pending (giữ logic hiện tại)

### 2.9 Request detail modal

Khi mở detail, hiển thị đầy đủ dữ liệu request đã fetch (kể cả raw nếu API trả):

- [ ] Metadata: time, session, schema, model, path, method, status, upstream, latency, error, usage missing
- [ ] Token breakdown đầy đủ
- [ ] `rawUsageJson` (pretty JSON nếu parse được)
- [ ] `requestJson` / `responseJson` nếu có
- [ ] Close: nút đóng + click backdrop + Escape
- [ ] Modal lớn, scroll nội dung, không vỡ layout mobile

### 2.10 Non-goals (không thêm scope mới trừ khi ghi rõ “bonus”)

Không bắt buộc trong redesign:

- Auth / multi-user
- Export CSV/JSON (trừ khi đã có sẵn)
- Filter/sort server-side mới
- Billing / cost estimate
- Dark-only marketing hero
- Landing page sections

**Bonus (nice-to-have, sau feature parity):**

- Copy proxy URL button
- Theme toggle Light / Dark / System
- Collapse settings panel
- Keyboard focus trap trong modal
- Model breakdown table

---

## 3. Vấn đề UI hiện tại (audit – phải fix)

### 3.1 Theme

- Chỉ dark hardcode (`bg-[#090b10]`, chart `theme.mode: "dark"`, date `[color-scheme:dark]`).
- `globals.css` có prefers-color-scheme nhưng page override hết → light mode thực tế không tồn tại.
- Không có theme toggle; không có semantic tokens.

### 3.2 Layout / hierarchy

- Một cột stack dọc: header → date → 6 cards → settings full-width → breakdown+anomalies → chart+table.
- Settings (proxy config) chen giữa metric và data workspace → cảm giác “form app”, không phải ops dashboard.
- Metric cards 6 cột equal weight; thiếu primary focus cho **Total tokens**.
- Request log + chart gộp một card khổng lồ; horizontal scroll table `min-w-[1260px]` thiếu mobile plan.
- Nhiều eyebrow uppercase tracking lặp lại (AI tell trên product UI).

### 3.3 Polish

- Border `white/10` + surface `white/[0.035]` lặp mọi card → flat, thiếu depth có kiểm soát.
- Status colors rải sky/emerald/amber/cyan/violet/white → **quá nhiều accent**; taste skill: 1 accent + semantic status colors.
- Loading/empty/error chưa đồng bộ skeleton shape.
- Confirm clear dùng `window.confirm` – được giữ function, nhưng UI redesign nên có confirm dialog styled (vẫn accessible).

---

## 4. Hướng thiết kế mục tiêu

### 4.1 Aesthetic direction

**Professional local ops console** gần:

- Linear settings density
- Vercel dashboard restraint
- GitHub Primer data tables
- Cloudflare / Railway “status console” clarity

**Không dùng:**

- AI purple gradients, neon glow, mesh background
- Glassmorphism toàn page
- 3 equal marketing feature cards
- Em-dash decorative copy
- Landing hero / scroll storytelling
- Inter-as-brand default (Geist đã OK; giữ Geist + Geist Mono)

### 4.2 Color system (dual theme bắt buộc)

Dùng **CSS variables / semantic tokens** (preferable) hoặc Tailwind `dark:` nhất quán. Một hệ thống, không mix.

```text
Light:
  --bg: off-white (zinc/stone 50–100, không #fff thuần nếu có thể)
  --surface: white elevated
  --border: zinc-200
  --text: zinc-900
  --text-muted: zinc-500
  --accent: single accent (recommend: sky-600 or emerald-600 – pick ONE)
  --danger: rose/red for clear/errors
  --warning: amber for usage missing
  --success: emerald for saved/ok

Dark:
  --bg: zinc-950 / near-black (không #000 thuần)
  --surface: zinc-900 elevated
  --border: white/10 or zinc-800
  --text: zinc-50
  --text-muted: zinc-400
  --accent: same family, slightly brighter for contrast
```

Rules:

1. **One brand accent** cho focus ring, primary button, active chart/link.
2. Semantic colors chỉ cho status (ok / warn / error / missing), không trang trí.
3. Metric numbers: muted label + strong mono value; chỉ Total tokens được nhấn mạnh hơn.
4. Chart colors phải readable trên **cả light và dark** (không hardcode pastel chỉ hợp dark).
5. WCAG AA contrast tối thiểu cho text và controls.

### 4.3 Theme behavior

- [ ] Support **light** và **dark**
- [ ] Default: `system` (`prefers-color-scheme`)
- [ ] Manual toggle: System | Light | Dark (persist `localStorage`)
- [ ] Apply class `dark` trên `<html>` hoặc `data-theme` – một strategy
- [ ] Date inputs `color-scheme` theo theme
- [ ] ApexCharts options recompute theo theme (grid, axis, tooltip, foreColor)
- [ ] No pure `#000` / pure `#fff` full-bleed nếu có thể tránh

### 4.4 Typography

- Sans: Geist (labels, headings, body)
- Mono: Geist Mono (tokens, IDs, URLs, paths, JSON)
- Headings compact (dashboard, không marketing scale)
- Section titles: `text-sm font-semibold`, **không** spam `uppercase tracking-[0.18em]` trên mọi label
- Numbers: `tabular-nums` + mono

### 4.5 Shape / elevation

- Radius scale cố định: e.g. controls `6–8px`, panels `10–12px` (một rule, áp dụng đều)
- Border 1px rõ; shadow tối thiểu (light: soft tinted; dark: gần như không shadow, dùng border)
- Không card-in-card vô nghĩa; dùng divide / border-t để group

### 4.6 Motion

- Hover: background subtle, `active:scale-[0.98]` hoặc translate 1px trên button
- Modal: fade + slight scale (≤150ms), respect `prefers-reduced-motion`
- Không infinite animation, không chart animate
- Polling refresh không flash full page

---

## 5. Layout architecture đề xuất (professional workspace)

Mục tiêu: **app shell** rõ zone, data-first, settings secondary.

```text
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR (h 56–64px)                                              │
│  Brand · Live status · Date range · Theme toggle · Refresh/Clear │
├──────────────────────────────────────────────────────────────────┤
│ METRIC STRIP (dense)                                             │
│  [Total ★] [Input] [Output] [Cache W] [Cache R] [Total cache]    │
├───────────────────────────────┬──────────────────────────────────┤
│ MAIN (flex-1)                 │ RIGHT RAIL (optional ≥lg)        │
│  Token trend chart            │  Anomalies                       │
│  Request log table            │  Proxy URLs (compact)            │
│  Pagination                   │  Upstream settings (collapsible) │
│                               │  Provider breakdown              │
└───────────────────────────────┴──────────────────────────────────┘
│ DETAIL: modal / drawer overlay when row selected                 │
└──────────────────────────────────────────────────────────────────┘
```

### 5.1 Top bar

- Left: product mark + short name
- Center/right: date range compact (From–To inline)
- Right cluster: Theme toggle · Refresh · Clear (destructive secondary)
- Height ≤ 64px desktop; wrap sạch trên mobile

### 5.2 Metric strip

- Dense horizontal strip, không 6 card cao bằng nhau kiểu marketing
- Total tokens visual weight cao hơn (size hoặc subtle border-accent)
- Optional micro-meta: request count / usage missing badge (nếu không đụng anomalies)

### 5.3 Main column

1. **Token trend** – toolbar toggles gọn (chip/pill, không raw checkbox xấu)
2. **Request log** – full width remaining height; sticky thead; row hover; keyboard-friendly focus
3. Pagination footer sticky trong panel

### 5.4 Right rail (≥ lg)

- Anomalies first (scan risk)
- Proxy endpoints + copy
- Upstream settings + Save (có thể collapsible “Configure upstreams”)
- Provider breakdown table (scroll x nếu cần)

### 5.5 < lg / mobile

- Single column stack order:
  1. Top bar
  2. Metrics
  3. Anomalies (compact)
  4. Chart
  5. Request log
  6. Provider breakdown
  7. Settings
- Table: horizontal scroll OK nhưng có visual cue; ưu tiên freeze cột Time + Model nếu dễ
- Modal full-screen-ish trên mobile

### 5.6 Detail surface

- Prefer large centered modal (giữ behavior) hoặc right drawer full-height
- Tabs optional trong detail: Overview | Raw usage | Request | Response
- JSON trong `<pre>` mono, scroll, max-height, copy button (bonus)

---

## 6. Component inventory (refactor gợi ý)

Tách `page.tsx` thần thành components (không bắt buộc file structure cứng, nhưng nên tách):

```text
components/
  app-shell.tsx
  top-bar.tsx
  theme-toggle.tsx
  date-range-bar.tsx
  metric-strip.tsx
  proxy-settings-panel.tsx
  anomalies-panel.tsx
  provider-breakdown.tsx
  request-chart.tsx
  request-table.tsx
  request-detail.tsx
  confirm-dialog.tsx
  ui/button.tsx, input.tsx, panel.tsx, badge.tsx  (primitives)
```

Logic data (fetch, polling, cursor, settings save) có thể giữ hooks:

```text
hooks/use-dashboard-data.ts
hooks/use-theme.ts
```

**Không đổi** lib backend: `lib/store.ts`, `lib/proxy.ts`, `lib/usage.ts`, API routes – trừ khi cần fix theme-unrelated bug.

---

## 7. State & interaction (giữ behavior)

| Behavior | Spec |
|----------|------|
| Initial load | settings + date=today; then summary/chart/requests |
| Polling | 2s interval nếu `!requestPending` |
| Race guard | `refreshSequence` / ignore stale responses |
| Pagination | cursor stack Previous/Next |
| Settings save | POST, disable while saving, status text |
| Clear | confirm → POST clear → reset cursor → refresh |
| Detail | GET by id → open modal |
| Date change | invalidate cursor + list + reload |

UI redesign **không được** làm mất polling, race guard, hay date validation.

---

## 8. Accessibility & quality bar

- [ ] Keyboard: tab order hợp lý; Escape đóng modal; focus trap trong modal
- [ ] Buttons có disabled states rõ
- [ ] Labels trên inputs (không placeholder-as-label)
- [ ] Color không phải kênh duy nhất cho error/status
- [ ] `aria-label` cho icon-only controls
- [ ] Skeleton loaders khớp shape metric/table (không chỉ spinner)
- [ ] Empty states actionable (nhắc set proxy env)
- [ ] Error states inline cho settings / load fail
- [ ] Lighthouse-ish: no layout jump lớn khi data về; chart container fixed height

---

## 9. Implementation constraints

1. **Feature parity first** – UI đẹp nhưng thiếu Clear/Date/Chart toggle/Detail raw = FAIL.
2. **No backend rewrite** – chỉ frontend presentation + theme plumbing.
3. **No new heavy UI framework** trừ khi cần primitives nhẹ (Radix Dialog/Toggle được nếu đã/fit; shadcn OK nếu customize, **không ship default shadcn look**).
4. **ApexCharts** giữ nếu không có lý do mạnh; phải theme-aware.
5. **Icons:** Phosphor / Hugeicons / Radix / Tabler – một family; không hand-roll SVG.
6. **Tests:** giữ `npm test` / lint / build pass. Không phá `date-range`, store, usage tests.
7. **Port / bind / README** không đổi behavior runtime.
8. TasteSkill landing rules (hero, bento, marquee) **không apply** – đây là dashboard (skill Section 13 out-of-scope for marketing patterns). Chỉ lấy: dual theme, anti-slop color, density, a11y, dials, redesign protocol.

---

## 10. Deliverables

1. Redesign toàn bộ `frontend` UI theo layout Section 5.
2. Semantic theme tokens + light/dark (+ system) working end-to-end.
3. Feature parity checklist Section 2 fully ticked.
4. Components tách gọn, `page.tsx` không còn 800+ lines monolit nếu có thể.
5. Brief note ngắn trong PR/commit: design read + dials + what changed visually.
6. Screenshots hoặc mô tả pair light/dark (optional nhưng khuyến khích).

### Definition of Done

- [ ] Light mode dùng được và đẹp (không “broken invert”)
- [ ] Dark mode dùng được và đẹp
- [ ] System preference + manual toggle persist
- [ ] Mọi feature Section 2 hoạt động như trước
- [ ] Layout desktop có rail / hierarchy rõ, không stack form-like
- [ ] Mobile usable
- [ ] Modal detail đầy đủ raw fields
- [ ] `npm test && npm run lint && npm run build` pass trong `frontend/`
- [ ] Zero AI marketing tells (no purple glow, no fake hero, no em-dash decoration)

---

## 11. Prompt ngắn để paste vào agent

```text
Redesign the entire WIMT Token Audit dashboard UI (frontend/app/page.tsx and related styles/components).

Product: local AI proxy + SQLite token audit dashboard for OpenAI/Anthropic-compatible CLIs.
Mode: visual/layout overhaul. Preserve 100% existing features and API behavior.

TasteSkill dials:
- DESIGN_VARIANCE: 3
- MOTION_INTENSITY: 2
- VISUAL_DENSITY: 8

Design read: professional local ops console (Linear/Vercel/Primer density), not a landing page.
Must ship dual light + dark themes (system default + manual toggle, persisted).
Replace the current dark-only stacked card layout with a clear app shell:
top bar (brand, date range, theme, refresh, clear) → dense metric strip →
main (chart + request log) + right rail (anomalies, proxy URLs, upstream settings, provider breakdown).
Use semantic color tokens, one accent, mono for numbers, skeleton/empty/error states.
Keep polling, date-range filtering, cursor pagination, settings save, clear confirm,
row detail modal with raw JSON, chart metric toggles, provider breakdown.

Do not change backend proxy/usage/store logic unless required for theme-unrelated bugs.
Pass tests, lint, and build. Follow docs/ui-redesign-prompt.md as the full brief.
```

---

## 12. File map hiện tại (để agent biết chạm đâu)

| Path | Role |
|------|------|
| `frontend/app/page.tsx` | Toàn bộ dashboard UI monolit – primary rewrite target |
| `frontend/app/globals.css` | Tokens + theme base – expand for light/dark semantic system |
| `frontend/app/layout.tsx` | Fonts, html/body shell – add theme class support if needed |
| `frontend/lib/date-range.ts` | Date range helpers – keep |
| `frontend/app/api/**` | Dashboard APIs – keep contracts |
| `frontend/lib/store.ts` / `proxy.ts` / `usage.ts` | Backend – do not redesign |

---

*End of redesign prompt. Agent: implement against this doc; do not invent product features; do not ship marketing chrome.*
