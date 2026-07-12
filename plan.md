# Prompt triển khai website local theo dõi token AI qua proxy

Bạn là senior full-stack engineer. Hãy xây một website chạy local để theo dõi lượng token sử dụng khi người dùng chạy Codex CLI, Claude CLI hoặc các tool AI khác thông qua một proxy local. Mục tiêu chính là ghi nhận chính xác usage từ response của provider, lưu log bằng SQLite, hiển thị dashboard rõ ràng, và cho phép đổi upstream endpoint để dùng OpenAI, Claude, hoặc endpoint AI khác tương thích chuẩn OpenAI/Claude.

## Mục tiêu sản phẩm

Xây một local app gồm backend proxy và frontend dashboard:

- Proxy nhận request từ client thay cho endpoint gốc của OpenAI/Anthropic.
- Proxy forward request đến upstream endpoint được cấu hình.
- Proxy tự nhận biết response usage thuộc dạng OpenAI-compatible hay Claude/Anthropic-compatible.
- Proxy lưu usage chi tiết vào SQLite cho từng request/response.
- Dashboard hiển thị input token, output token, cache write, cache read, total cache, total token.
- Dashboard phân tách theo provider/schema nhận diện được: `openai`, `anthropic`, hoặc `unknown`.
- Dashboard cho phép clear toàn bộ log để bắt đầu đo lại từ đầu.
- App chạy local, không cần cloud, không cần auth phức tạp.

## Vấn đề cần giải quyết

Người dùng muốn kiểm tra provider có tính token đúng hay không. Vì vậy hệ thống phải lưu raw usage mà API trả về, đồng thời chuẩn hóa sang các trường chung để dễ so sánh.

Không tự bịa token nếu provider không trả usage. Nếu thiếu field, lưu `null` hoặc `0` theo logic rõ ràng và đánh dấu record là thiếu usage.

## Phạm vi bắt buộc

### 1. Local proxy backend

Backend cần expose proxy endpoint nhận mọi request API AI:

- OpenAI-compatible:
  - `/v1/chat/completions`
  - `/v1/responses`
  - `/v1/embeddings` nếu dễ hỗ trợ bằng cùng cơ chế
- Anthropic-compatible:
  - `/v1/messages`
- Có thể thêm catch-all `/proxy/*` nếu framework thuận tiện.

Proxy phải:

- Giữ nguyên method, headers quan trọng, body, query string.
- Forward `Authorization`, `x-api-key`, `anthropic-version`, content-type, accept.
- Cho phép thay upstream base URL bằng env hoặc UI setting.
- Không log API key.
- Không làm hỏng streaming response.
- Với non-stream response: parse JSON response để lấy usage rồi lưu DB.
- Với stream response: forward stream về client; nếu stream có final usage event thì gom usage và lưu sau khi stream kết thúc. Nếu chưa làm streaming usage đầy đủ ở MVP, vẫn phải proxy stream đúng và ghi log metadata với `usage_missing=true`.

### 2. Cấu hình endpoint

Hỗ trợ cấu hình đơn giản:

- `OPENAI_UPSTREAM_BASE_URL`, mặc định `https://api.openai.com`
- `ANTHROPIC_UPSTREAM_BASE_URL`, mặc định `https://api.anthropic.com`
- `DEFAULT_PROVIDER`, mặc định `auto`
- Có UI hoặc file/env để đổi endpoint sang provider khác, ví dụ endpoint AI Trung Quốc tương thích OpenAI.

Khi provider là `auto`, backend tự nhận biết theo:

- Request path/header/body.
- Response usage shape.
- Upstream profile nếu người dùng chọn thủ công.

Không hard-code chỉ OpenAI/Claude chính chủ. Nhiều vendor dùng schema giống OpenAI hoặc Claude.

### 3. Tự nhận biết usage schema

Backend cần có hàm normalize usage riêng, nhận raw response JSON và trả về:

```ts
type ProviderSchema = "openai" | "anthropic" | "unknown";

type NormalizedUsage = {
  schema: ProviderSchema;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheReadTokens: number | null;
  totalCacheTokens: number | null;
  totalTokens: number | null;
  rawUsage: unknown;
  usageMissing: boolean;
};
```

OpenAI-compatible mapping:

- `usage.prompt_tokens` -> input token.
- `usage.completion_tokens` -> output token.
- `usage.total_tokens` -> total token.
- `usage.prompt_tokens_details.cached_tokens` -> cache read token nếu có.
- `usage.prompt_tokens_details.cache_write_tokens` hoặc field tương tự -> cache write token nếu provider trả.
- `totalCacheTokens = cacheReadTokens + cacheWriteTokens` khi có dữ liệu.

Anthropic-compatible mapping:

- `usage.input_tokens` -> input token.
- `usage.output_tokens` -> output token.
- `usage.cache_creation_input_tokens` -> cache write token.
- `usage.cache_read_input_tokens` -> cache read token.
- `totalTokens = inputTokens + outputTokens + cacheWriteTokens + cacheReadTokens` nếu API không trả total riêng.
- `totalCacheTokens = cacheCreation + cacheRead`.

Unknown:

- Lưu raw usage nếu tìm thấy `usage`.
- Không đoán mapping nếu field không rõ.
- Đánh dấu `usageMissing=true` nếu không có usage.

### 4. SQLite logging

Dùng SQLite local. Không cần database server.

Tạo bảng tối thiểu:

```sql
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  provider_schema TEXT NOT NULL,
  upstream_base_url TEXT NOT NULL,
  request_path TEXT NOT NULL,
  method TEXT NOT NULL,
  model TEXT,
  status_code INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_write_tokens INTEGER,
  cache_read_tokens INTEGER,
  total_cache_tokens INTEGER,
  total_tokens INTEGER,
  usage_missing INTEGER NOT NULL DEFAULT 0,
  raw_usage_json TEXT,
  error TEXT,
  latency_ms INTEGER
);
```

Có thể thêm bảng settings nếu UI cần đổi endpoint mà không restart:

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Không lưu prompt full/raw request body mặc định vì dễ chứa dữ liệu nhạy cảm. Nếu thêm option debug raw body thì phải tắt mặc định.

### 5. Dashboard frontend

Tạo dashboard local hiển thị:

- Tổng input tokens.
- Tổng output tokens.
- Tổng cache write tokens.
- Tổng cache read tokens.
- Tổng cache tokens.
- Tổng tokens.
- Số request.
- Số request thiếu usage.
- Tổng theo provider schema.
- Tổng theo model.
- Bảng log request gần nhất.

Mỗi row log hiển thị:

- thời gian
- schema/provider
- model
- path
- status code
- input/output/cache write/cache read/total
- latency
- upstream host
- trạng thái usage missing/error

Có nút:

- Refresh.
- Clear all logs.
- Export CSV hoặc JSON nếu ít code.

Clear all phải có confirm đơn giản. Sau clear, dashboard về số 0.

### 6. API nội bộ cho dashboard

Backend expose:

- `GET /api/summary`
  - trả totals chung, group by schema, group by model.
- `GET /api/requests?limit=100&offset=0`
  - trả log gần nhất.
- `POST /api/clear`
  - xóa toàn bộ logs.
- `GET /api/settings`
  - trả upstream config hiện tại, không trả secret.
- `POST /api/settings`
  - cập nhật upstream base URL nếu có hỗ trợ UI setting.

### 7. Yêu cầu bảo mật local

- Không log `Authorization`, `x-api-key`, cookie.
- Không expose server ra public network mặc định. Bind `127.0.0.1`.
- Nếu có CORS, chỉ mở cho frontend local.
- Validate upstream URL trước khi lưu setting.
- Không gửi log ra ngoài.

### 8. Cách dùng mong muốn

Sau khi chạy app local, người dùng có thể trỏ CLI sang proxy:

OpenAI-compatible:

```bash
export OPENAI_BASE_URL=http://127.0.0.1:3000/v1
export OPENAI_API_KEY=sk-...
```

Anthropic-compatible:

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:3000
export ANTHROPIC_API_KEY=sk-ant-...
```

Nếu Codex CLI hoặc Claude CLI dùng biến env khác, ghi rõ trong README phần cấu hình.

Proxy sẽ forward đến upstream thật theo config. Ví dụ:

- Client gọi `http://127.0.0.1:3000/v1/responses`.
- Proxy forward đến `${OPENAI_UPSTREAM_BASE_URL}/v1/responses`.
- Proxy lấy response usage, normalize, lưu SQLite, trả response gốc về client.

### 9. Kiểm thử tối thiểu

Viết test nhỏ cho hàm normalize usage:

- OpenAI `chat.completions` usage có prompt/completion/total.
- OpenAI usage có cached_tokens.
- Anthropic usage có input/output/cache_creation/cache_read.
- Response không có usage.
- Unknown usage không bị map sai.

Viết test hoặc script demo cho API summary:

- Insert vài record mẫu.
- `GET /api/summary` trả tổng đúng.
- `POST /api/clear` xóa sạch.

### 10. Tiêu chí hoàn thành

App được xem là xong khi:

- Chạy local bằng một lệnh documented.
- Proxy được OpenAI-compatible request và Anthropic-compatible request.
- Response trả về client giữ nguyên shape.
- SQLite có log usage sau mỗi request non-stream có usage.
- Dashboard hiển thị đúng tổng input/output/cache/total.
- Clear all hoạt động.
- Có test normalize usage.
- README có hướng dẫn cấu hình CLI qua proxy.

## Ưu tiên triển khai

Làm theo thứ tự:

1. Backend SQLite schema và normalize usage.
2. Non-stream proxy cho OpenAI-compatible và Anthropic-compatible.
3. Dashboard summary + request table.
4. Clear logs.
5. Settings endpoint/upstream URL.
6. Streaming passthrough.
7. Streaming usage logging nếu provider có final usage event.

Không thêm login, multi-user, billing, chart phức tạp, Docker, hoặc cloud deploy trong MVP nếu không cần.

## Gợi ý stack

Ưu tiên stack đơn giản đang có trong repo. Nếu repo chưa có app:

- Next.js local app hoặc Vite + Express đều được.
- SQLite dùng driver đã có sẵn nếu repo có dependency; nếu chưa có, chọn dependency phổ biến, ít cấu hình.
- Frontend dùng CSS thường hoặc Tailwind nếu đã có sẵn.

Không thêm dependency chart nếu chỉ cần bảng và số tổng. Có thể dùng HTML table trước.

## TasteSkill layout dials

Áp dụng 3 thông số của tasteskill cho dashboard này:

```txt
DESIGN_VARIANCE: 4
MOTION_INTENSITY: 2
VISUAL_DENSITY: 8
```

Lý do:

- `DESIGN_VARIANCE: 4` vì đây là devtool/dashboard kiểm toán token, cần rõ ràng, đáng tin, ít phá cách.
- `MOTION_INTENSITY: 2` vì dashboard dùng lặp lại hàng ngày, chỉ cần hover/focus/loading nhẹ, không cần animation gây nhiễu.
- `VISUAL_DENSITY: 8` vì người dùng cần quét nhiều số liệu, model, provider, request log và usage anomaly trong một màn hình.

Hướng layout theo 3 dials này:

- Màn hình chính là dashboard làm việc, không làm landing page.
- Header mỏng gồm tên app, trạng thái proxy, upstream đang dùng, nút refresh, nút settings.
- Hàng đầu là metric strip 6 ô: input, output, cache write, cache read, total cache, total token.
- Bên dưới chia 2 cột: trái là breakdown theo provider/model, phải là anomaly/usage missing/error.
- Phần lớn còn lại là bảng request log dày, có sticky header, filter theo provider/model/status, sort theo thời gian/token.
- Dùng màu nền trung tính, một accent duy nhất cho trạng thái active. Không dùng AI-purple gradient/glassmorphism.
- Cards bo góc nhỏ 6-8px, border rõ, shadow tối thiểu hoặc không shadow.
- Typography ưu tiên mono cho số token và sans cho label. Số liệu phải thẳng hàng để so sánh dễ.
- State bắt buộc: loading skeleton theo shape bảng, empty state sau khi clear, error inline khi proxy/settings lỗi.

## Lưu ý quan trọng

Token verification trong MVP là đối chiếu usage provider trả về, không phải tự tokenize prompt. Nếu muốn tự kiểm chứng bằng tokenizer riêng, để phase sau vì OpenAI/Claude/tokenizer của vendor khác nhau và dễ sai.

Tuy nhiên DB phải lưu `raw_usage_json` để sau này so sánh lại hoặc audit nếu provider trả field lạ.
