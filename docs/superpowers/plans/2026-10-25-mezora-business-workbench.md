# Mezora Business Workbench Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement task-by-task. Steps use checkbox syntax. Do not delegate unless authorized. This document is a full-scope implementation roadmap with module contracts and acceptance gates; production code is written during execution after checking current files and Next.js local documentation.

**Execution update (25/10/2026):** R0–R6 implementation deployed at `/workbench`; 157 application tests and 35 contract tests pass. Acceptance is tracked separately in [WORKBENCH_RELEASE.md](../../WORKBENCH_RELEASE.md). R7 contract V2 is tested locally only and is not deployed. Unchecked acceptance items remain required.

**Goal:** Hoàn thiện Mezora thành workspace để đội nhỏ tiếp nhận hóa đơn, kiểm soát cam kết chi, lập kế hoạch tiền, thanh toán MUSD và xem xét trả nợ có bằng chứng.

**Architecture:** Giữ Next.js + PostgreSQL + domain bigint và Mezo adapters hiện có. Tách các module mới theo nghiệp vụ; policy/forecast là deterministic, AI chỉ tạo draft có dẫn nguồn. Triển khai phần lớn tính năng trên treasury hiện tại; multi-signature enforcement là một bản contract riêng có migration, không trộn vào nâng cấp frontend.

**Tech Stack:** Next.js 16.4.2, React 19.3.1, TypeScript, viem 2.57.10, PostgreSQL/PGlite, Solidity, OKX browser wallet. OCR/LLM là adapter phía server, chọn nhà cung cấp khi triển khai theo chất lượng và chi phí thực; chức năng thủ công không phụ thuộc adapter.

---

## 1. Phạm vi, baseline và quyết định kiến trúc

Ngày lập: 25/10/2026. Repo root: `D:/bitgethackathon/products/mezora`. Các đường dẫn mã bên dưới tương đối với root này. Trạng thái ban đầu: deploy treasury, deposit, reserve/pay bill và partial repay đã có bằng chứng testnet trong docs; chưa coi là audit hay production-ready.

User yêu cầu đủ 11 nhóm: receipt; cash-impact; UX repayment; CSV import; statement export; recurring; forecast; invoice/payee controls; document ingestion; team approvals; receivables. Recurring và báo cáo đóng kỳ được gộp một module, không triển khai hai bản trùng nhau.

Ba phương án đã cân nhắc:

1. **Khuyến nghị — mở rộng theo module và phát hành từng phần:** ít xáo trộn luồng đã chạy, dùng lại receipt verifier, giữ khoản chi do owner ký. Nhược điểm: app approvals chưa phải quorum on-chain.
2. Đổi toàn bộ sang smart account/multisig ngay: quyền nhóm mạnh hơn nhưng phát sinh deployment, compatibility, migration và acceptance ví; trì hoãn mọi tính năng khác.
3. Đưa mọi thứ vào AI tự động: demo có vẻ nhanh nhưng không giải quyết quyền ký, deterministic accounting và bằng chứng; không chọn.

Nguyên tắc cố định:

- MUSD base units bigint 18 decimals; JSON truyền chuỗi số nguyên, không float.
- Reserve là earmark owner có thể hủy, không escrow. Buffer là ngưỡng kế hoạch/app policy trừ khi contract v2 cưỡng chế.
- Treasury withdraw và borrower repay là hai giao dịch, hai receipt; không coi tổng thể atomic.
- Balance trên chain, dự kiến thu, simulation và quote có nhãn khác nhau.
- Giữ nguyên quyền owner; không cho OCR/LLM hoặc worker giữ private key hay tự ký.
- Dữ liệu bill, file và thành viên private mặc định. Trang public chỉ có dữ liệu chain và phần owner chủ động chia sẻ.
- Không thay đổi chain/token/contract deployment chỉ để hỗ trợ tính năng UI.

## 2. Thứ tự và các bản phát hành

| Release | Module | Phụ thuộc | Kết quả có thể bàn giao |
|---|---|---|---|
| R0 | Nền dữ liệu/versioning | Baseline | Migration an toàn, module flags, regression baseline |
| R1 | Receipt + UX + cash-impact | R0 | Bill/repay có proof, trạng thái dễ hiểu, handoff rút→trả nợ |
| R2 | Forecast + invoice/payee controls | R1 | Phát hiện thiếu tiền theo ngày và sai sót trước chi |
| R3 | CSV + statement + recurring/closing | R2 | Làm việc theo lô và theo tháng, báo cáo đối soát được |
| R4 | PDF/ảnh → draft | R2, import draft R3 | Từ chứng từ đến bill được người dùng xác nhận |
| R5 | Team approvals | R0,R2 | Requester/reviewer/owner trên workspace private |
| R6 | Receivables + cash-plan integration | R2,R5 | Khoản thu thực cập nhật khả năng chi, không đếm tiền dự kiến như balance |
| R7 | On-chain approval enforcement | R5, contract design | Treasury mới kiểm quorum/policy thực, migration tùy chọn |

R1–R2 là gói nên ưu tiên cho demo cuộc thi; R3–R6 hoàn thiện toàn bộ công việc người dùng yêu cầu. R7 là mức cưỡng chế nâng cao của tính năng roles, không được ngầm hứa v1 đã có.

Ước lượng sơ bộ cho một builder và agent, gồm sửa lỗi/acceptance, không phải cam kết: R0–R1 2–4 ngày; R2 2–4; R3 3–5; R4 2–4; R5 3–5; R6 3–5. Tổng R0–R6 khoảng 15–27 ngày làm việc tập trung; R7 thêm 5–10 ngày kỹ thuật và review độc lập chưa nằm trong số đó. Điều chỉnh sau mỗi release; không hứa hoàn thành cả scope trước deadline khi chưa đối chiếu lịch cuộc thi.

## 3. Sơ đồ module và file

Đã kiểm tra tồn tại: `packages/db/src/database.ts`, `workspace.ts`, `packages/domain/src/{money,bill,payment-intent}.ts`, `packages/mezo/src/{trove,repayment-receipt,treasury-abi}.ts`, `apps/web/src/server/{auth,live,repayment,proposal}.ts`, `apps/web/src/components/{workspace,repayment-workspace,wallet-payload,okx-provider}.tsx` (các helper wallet thực tế có đuôi `.ts`, không `.tsx`).

File mới dự kiến:

| Domain | Persistence/server | UI |
|---|---|---|
| `packages/domain/src/cash-plan.ts` | `apps/web/src/server/cash-plan.ts` | `apps/web/src/features/cash-plan/cash-plan-panel.tsx` |
| `packages/domain/src/policy.ts` | `apps/web/src/server/policy.ts` | `apps/web/src/features/bills/policy-review.tsx` |
| `packages/domain/src/statement.ts` | `apps/web/src/server/statement.ts` | `apps/web/src/features/reports/statement-panel.tsx` |
| `packages/domain/src/recurrence.ts` | `apps/web/src/server/recurring.ts` | `apps/web/src/features/bills/recurring-panel.tsx` |
| `packages/domain/src/receivable.ts` | `apps/web/src/server/receivables.ts` | `apps/web/src/features/receivables/receivables-panel.tsx` |
| `packages/domain/src/approval.ts` | `apps/web/src/server/memberships.ts` | `apps/web/src/features/team/team-panel.tsx` |
| — | `apps/web/src/server/receipt.ts` | `apps/web/src/app/receipt/[chainId]/[txHash]/page.tsx` |
| — | `apps/web/src/server/imports.ts` | `apps/web/src/features/bills/import-review.tsx` |
| — | `apps/web/src/server/documents.ts` | `apps/web/src/features/bills/document-review.tsx` |

Tách khỏi `workspace.tsx` khi thêm module, không viết lại toàn bộ UI đang hoạt động. API mới nằm trong `apps/web/src/app/api/<module>/route.ts`; các resource có ID dùng `[id]`. Đọc `apps/web/AGENTS.md` và Next docs cài trong repo trước viết route.

## 4. Hợp đồng dữ liệu chung

Tất cả bảng nghiệp vụ mới có `id`, `workspace_id`, `version`, `created_at`, `updated_at`. FK/unique scope theo workspace; không dùng ID do client gửi để bỏ qua authorization. Các đề xuất/signature ràng buộc `workspace + entity + entityVersion + termsHash + policyVersion + chainId + expiry`.

Thêm migration có version vào `packages/db/src/migrations/`, migration runner dùng transaction/advisory lock giống database.ts. Không sửa body JSON cũ bằng assumption mù; backfill có kiểm tra row count, preserve bill IDs/tx hashes.

Các bảng bổ sung theo release:

- R0: `schema_migrations`, `audit_events` append-only cho nghiệp vụ; version trong bill body và optimistic concurrency.
- R2: `vendors`, `vendor_addresses`, `policies`, `policy_decisions`, `cash_plan_scenarios`. Amount/cap numeric(78,0); policy version bất biến sau publish.
- R3: `import_batches`, `import_rows`, `recurring_templates`, `recurring_occurrences`, `statement_runs`, `period_closes`.
- R4: `documents`, `document_extractions`; lưu object key private, SHA256, mime/size/status, output và citations; không đưa binary lên chain.
- R5: `workspace_members`, `workspace_invites`, `approval_requests`, `approval_votes`; votes unique theo request/version/member.
- R6: `receivables`, `receivable_allocations`; mỗi chain/txHash/logIndex chỉ được phân bổ tổng tối đa số tiền thực nhận; dùng unique identity và transaction lock để chống double-credit.

API mutation nhận `expectedVersion` và `idempotencyKey`; conflict trả 409 kèm phiên bản hiện tại, không tự ghi đè. Session vẫn xác thực ví; membership được đọc server cho mỗi hành động, không tin role client.

## Task 0 — Chuẩn bị nền dữ liệu và release

**Files:** sửa `packages/db/src/database.ts`; tạo `packages/db/src/migrations/001-business-workbench.ts`, `apps/web/src/server/features.ts`; cập nhật `docs/implementation-status.json`.

- [ ] Ghi lại git status; giữ các thay đổi docs và file Next hiện có. Chỉ commit file thuộc nhiệm vụ.
- [ ] Đọc schema/workspace/auth/live và lập bảng mapping bill state hiện tại trước migration.
- [ ] Tạo migration registry; lần đầu ghi nhận baseline, migration chạy một lần trong transaction; failure rollback, không mất bảng cũ.
- [ ] Bổ sung version/idempotency cho mutation mới; tạo audit event trong cùng transaction dữ liệu.
- [ ] Thêm feature flags server cho từng module, mặc định tắt đến khi acceptance đạt.
- [ ] Sao lưu/snapshot DB trước production migration; không in URL hoặc dữ liệu private vào log.

**Gate:** dữ liệu enzo và receipt cũ đọc nguyên vẹn; session owner cũ vẫn đúng workspace; khởi động lặp lại không chạy lại backfill.

## Task 1 — Receipt công khai

**Files:** tạo `server/receipt.ts`, route `app/api/receipts/[chainId]/[txHash]/route.ts`, page `app/receipt/[chainId]/[txHash]/page.tsx`; sửa `server/live.ts`, `server/repayment.ts`, UI Activity và bill drawer trong `components/workspace.tsx`.

- [ ] Tách read-only receipt verification dùng chung; không duplicate phép xác minh success/canonical block/event đã có.
- [ ] Validate chain allowlist và hash 32 bytes; không nhận RPC URL tùy ý từ query.
- [ ] Với payment: decode treasury event và MUSD Transfer; đối chiếu amount/recipient/termsHash, runtime hoặc deployment binding hợp lệ. Repayment dùng verifier chuyên biệt; không giả tạo termsHash nếu event không có.
- [ ] Trả DTO public gồm action/token/amount base units/from/to/txHash/blockNumber/blockHash/confirmation count/checkedAt/status và termsHash khi có.
- [ ] Trang không cần ví; có pending, confirmed, reverted, unavailable, unsupported. RPC lỗi không biến receipt đã có thành failed; block đổi phải tái xác minh.
- [ ] Chỉ đọc on-chain fields ở URL tx. Nếu muốn chia sẻ vendor/memo, tạo owner-opt-in share token ngẫu nhiên, lưu hash token, cho revoke; không public hóa bill ID enumeration.
- [ ] Thêm Copy receipt link ở bill paid, activity, repayment; có explorer fallback.

**Gate:** mở incognito thấy amount/recipient/block/status đúng; không thấy private memo; failed tx không thành paid; refresh sau reorg/mock canonical change gỡ confirmed; chưa thể kiểm chain thì ghi unavailable.

## Task 2 — UX hành động và repayment

**Files:** sửa `components/repayment-workspace.tsx`, `components/workspace.tsx`, `app/repay/repay.css`; tạo `features/transactions/action-progress.tsx`, `packages/domain/src/format-money.ts`.

- [ ] Đưa Repayment vào navigation và Treasury action rõ ràng; giữ OKX provider pinning/network validation.
- [ ] Dùng state machine `idle → previewing → review → preparing → awaiting_wallet → submitted → confirming → confirmed`; nhánh rejected/reverted/unavailable/retryable có hành động riêng.
- [ ] Preview chỉ tính; nút ký ghi rõ mở OKX. Trong preparing hiển thị đang kiểm trạng thái và simulate, chưa yêu cầu ví.
- [ ] Có tx hash ngay khi ví trả; timeout/indexing chậm vẫn pending; retry reconciliation không tạo giao dịch mới.
- [ ] Hiện expiry theo thời gian server; hết hạn yêu cầu preview mới, giữ amount nhưng reset checkbox; không âm thầm renew nội dung đã duyệt.
- [ ] Debt/interest hiển thị 2–6 chữ số phù hợp, có xem exact base units; giá trị dùng ký không lấy từ display rounding.

**Gate:** người dùng phân biệt được preview/ký/pending; wallet rejection không thành chain failure; đã có hash không gửi lặp; hai tab không đồng thời tạo repayment khác dùng cùng intent.

## Task 3 — Cash-impact và handoff withdraw → repay

**Files:** tạo `packages/domain/src/cash-plan.ts`, `server/cash-plan.ts`, `features/cash-plan/cash-impact-card.tsx`; sửa `server/proposal.ts`, `server/repayment.ts`, Treasury UI.

- [ ] Dùng cùng snapshot đã xác minh để tính `unreserved=max(0,balance-reserved)` và `surplus=max(0,balance-reserved-buffer)`.
- [ ] Hiện balance, reserved, buffer, surplus theo một luồng; pending outgoing được ghi riêng và không bị đếm hai lần khi receipt xác nhận.
- [ ] Nếu chọn treasury-funded repayment, giới hạn theo surplus, withdrawable và repay capacity từ adapter Trove; capacity bao gồm quy tắc min debt/gas compensation hiện tại.
- [ ] Tạo handoff record: reviewed amount → withdrawal tx → confirmed withdrawal → fresh wallet/Trove read → repayment preview → repayment tx → confirmed. Mỗi bước có intent riêng.
- [ ] Nếu owner đổi amount, chain, wallet hoặc dữ liệu hết hạn: dừng và review lại; withdraw thành công nhưng repay fail thì báo tiền còn trong ví, không nói rollback.
- [ ] Repayment từ tiền ví sẵn có vẫn cho phép độc lập, ghi rõ không sử dụng treasury surplus.

**Gate:** balance99/reserved0/buffer300 cho surplus0; không đề xuất rút để repay từ treasury. Scenario có surplus dương cho thấy đủ hai bước và receipt riêng.

## Task 4 — Lịch chi trả và forecast 30 ngày

**Files:** mở rộng `domain/cash-plan.ts`; tạo `features/cash-plan/cash-plan-panel.tsx`, route `api/cash-plan/route.ts`; tạo persistence `packages/db/src/cash-plan.ts`.

- [ ] Chuẩn hóa bill dueDate theo timezone workspace; overdue hiển thị cần chi hôm nay, không biến ngày quá khứ thành chi đã xảy ra.
- [ ] Tách confirmed payable, draft chưa duyệt, recurring dự kiến và receivable dự kiến. Base case chỉ dùng nguồn tiền đã có; scenario cho phép khoản thu dự kiến có nhãn.
- [ ] Tính closing theo ngày từ opening balance và future cash movements. Reserve không phải cash out nên không trừ thêm lần nữa trong đường balance theo ngày.
- [ ] Hiển thị ngày đầu cash thấp hơn buffer, số thiếu và những khoản gây thiếu; trạng thái dữ liệu không đủ thay vì dự báo chắc chắn.
- [ ] Thêm what-if repayment hôm nay, expense thêm, khoản thu trễ; scenario không mutate bills hoặc actual balance.
- [ ] Khi dùng forecast giới hạn repayment, lấy mức nhỏ nhất của current surplus và headroom tối thiểu trong kỳ; không dựa khoản thu chưa confirmed để tăng giới hạn ký.

**Gate:** scenario1000, payables400 ngày3 và300 ngày10, buffer200: repay150 khiến thiếu50 ở ngày10. Bill reserved rồi paid chỉ tác động dòng tiền một lần. Scenario lưu/reload tái lập cùng input version.

## Task 5 — Vendor, duplicate và budget policy

**Files:** tạo `domain/policy.ts`, `server/policy.ts`, `packages/db/src/vendors.ts`, `features/bills/policy-review.tsx`; sửa API bills và action prepare trong `server/live.ts`.

- [ ] Vendor registry owner-confirmed với address version; address mới yêu cầu xác nhận, không tự cập nhật từ tài liệu.
- [ ] Exact duplicate theo workspace/vendor/invoice reference + file hash; amount giống nhau chỉ warning, không tự coi invoice trùng.
- [ ] Hard block bill paid, sai token/chain, recipient invalid, không đủ unreserved funds; warning/escalation cho thay payee, suspected duplicate và vượt category budget.
- [ ] Budget theo kỳ/timezone: consumed và committed riêng; quyết định và đặt commitment trong transaction có khóa để hai request không cùng chi phần hạn mức còn lại.
- [ ] Mỗi decision lưu input hash, rule outcomes, policyVersion, evaluatedAt; override warning cần lý do owner, không override exact chain/receipt failures.
- [ ] Sửa amount/recipient/terms/policy vô hiệu hóa approval/intent cũ; re-evaluate tại prepare, không chỉ khi tạo draft.

**Gate:** thay ví vendor A→B hiện khác biệt và cần xác nhận; cùng file retry không tạo bill đôi; invoice tháng mới cùng amount không bị chặn mù. UI nói rõ enforcement tại app, owner vẫn có quyền contract trực tiếp.

## Task 6 — CSV import

**Files:** tạo `server/imports.ts`, `features/bills/import-review.tsx`, routes `api/imports/route.ts`, `api/imports/[id]/commit/route.ts`; dùng chung bill creation service đã có policy.

- [ ] Schema CSV v1: `vendor,invoice_number,recipient,amount_musd,due_date,category,memo`; ngày ISO YYYY-MM-DD, amount chuỗi thập phân, không scientific notation.
- [ ] Giới hạn ban đầu 200 rows, 2 MB; trim/BOM/quoted delimiters đúng; reject hơn18 decimal và địa chỉ không hợp lệ.
- [ ] Preview theo từng dòng, map vendor và đánh dấu duplicate/missing field; không tạo bill lúc upload.
- [ ] Commit chỉ dòng hợp lệ được chọn, transaction + import row key chống lặp; retry trả cùng bill IDs.
- [ ] Tất cả thành draft; không reserve hoặc pay tự động. Nhập theo lô không quảng bá thành batch transaction.

**Gate:** nhập lặp cùng batch không nhân bill; lỗi dòng7 không che lỗi dòng khác; CSV export escape công thức bắt đầu bằng =,+,-,@ và giữ nguyên canonical raw value trong JSON.

## Task 7 — Statement export và đóng kỳ

**Files:** tạo `domain/statement.ts`, `server/statement.ts`, `features/reports/statement-panel.tsx`, routes `api/statements/route.ts`, `api/statements/[id]/export/route.ts`.

- [ ] Chọn treasury, chain và khoảng block finalized; đọc opening/closing MUSD balance đúng block, scan Transfer logs có pagination/chunk/retry bounded.
- [ ] Dedup bằng chain/tx/logIndex; xử lý transfer vào trực tiếp ngoài app và self-transfer không làm sai net flow.
- [ ] Join bills/events khi có bằng chứng, giao dịch không biết hiện unclassified. Reserve/cancel là memo allocation, không đưa thành tiền vào/ra.
- [ ] Tính `difference=closing-opening-inflows+outflows`; difference khác0 hoặc log coverage thiếu thì unreconciled/partial, không verified.
- [ ] Export CSV cho người dùng và JSON canonical có base units/block hashes/coverage/version; PDF printable dùng cùng dữ liệu.
- [ ] Period close ghi snapshot + adjustments, không khóa bất biến sai khi có reorg. Reopen tạo phiên bản mới, giữ trail.

**Gate:** tái dựng bằng JSON ra cùng totals; trực tiếp chuyển MUSD đến treasury vẫn xuất hiện; thiếu một chunk báo partial; private report chỉ thành viên có quyền tải.

## Task 8 — Recurring bills

**Files:** tạo `domain/recurrence.ts`, `server/recurring.ts`, `features/bills/recurring-panel.tsx`, route `api/recurring/route.ts`; tích hợp `apps/worker/src/main.ts` khi bật scheduler.

- [ ] Template amount/vendor/recipient/category, tần suất hàng tuần/tháng, timezone, start/end; ngày31 trong tháng ngắn lấy ngày cuối tháng, ghi rõ UI.
- [ ] Unique(templateId,periodKey); generator transaction tạo draft tối đa một lần/kỳ. Pause/resume không tự tạo toàn bộ nợ quá khứ.
- [ ] On-demand generation trước; thêm cron xác thực + DB job lock/retry khi có host scheduler. Không hứa 24/7 khi chỉ on-demand.
- [ ] Bill đã tạo giữ template snapshot; sửa template chỉ áp dụng kỳ tương lai. Tăng amount hiện delta và cần review mới.
- [ ] Đưa occurrence chưa generate vào forecast dưới nhãn planned, khi generate thay đúng occurrence, không double-count.

**Gate:** hai worker/tabs gọi đồng thời vẫn một bill; pause chặn kỳ tiếp; không tự ký hay charge ví; template và actual bill khớp kỳ trong statement.

## Task 9 — PDF/ảnh thành draft có nguồn

**Files:** tạo `server/documents.ts`, `server/document-extractor.ts`, `features/bills/document-review.tsx`, routes `api/documents/route.ts`, `api/documents/[id]/extract/route.ts`, `api/documents/[id]/draft/route.ts`.

- [ ] Private object storage adapter; signed upload/download TTL ngắn, limit10 MB/10 trang PDF; MIME magic bytes, reject file không hỗ trợ hoặc encrypted PDF thay vì parse mù.
- [ ] Parse text PDF trước; OCR ảnh/scan qua server adapter; job persistence trạng thái queued/running/succeeded/failed, retry idempotent theo document hash và extractor version.
- [ ] Output schema fields gồm value, page, quote/bounding box, confidence; confidence chỉ hỗ trợ review, không quyền chi.
- [ ] User xem chứng từ cạnh trường trích; amount, currency, recipient, dueDate thiếu/mâu thuẫn phải sửa. Không auto-convert USD sang MUSD như cùng tài sản.
- [ ] Source document là untrusted data, extractor không có tool thanh toán; giới hạn token/trang, workspace quota và cost log không lộ nội dung nhạy cảm.
- [ ] Confirm tạo draft qua cùng policy/import pipeline; document hash chống trùng; cho xóa file riêng trong khi giữ audit metadata tối thiểu theo lựa chọn retention công khai.

**Gate:** PDF sai currency bị giữ ở review; OCR address không tự thay vendor registry; prompt injection trong invoice không tạo tool call; tắt provider vẫn có nhập thủ công/CSV.

## Task 10 — Thành viên và approval workflow

**Files:** tạo `domain/approval.ts`, `server/memberships.ts`, `packages/db/src/memberships.ts`, `features/team/team-panel.tsx`, routes `api/members/route.ts`, `api/approvals/route.ts`; sửa `server/auth.ts`, mọi workspace API truy cập dữ liệu.

- [ ] Roles: owner cấu hình/ký; requester tạo/sửa draft mình tạo; reviewer duyệt hoặc trả về; viewer chỉ xem. Owner hiện tại backfill thành member owner đúng workspace.
- [ ] Invite link token ngẫu nhiên hash-at-rest/expiry/one-use, chấp nhận bằng wallet session; không tự gửi email chưa được user yêu cầu.
- [ ] Request snapshot ràng buộc termsHash/version; reviewer không tự duyệt request của mình khi bật separation-of-duties.
- [ ] Approval threshold theo category/amount; sửa bill hủy votes trước, revoke member vô hiệu quyền mới ngay; audit lịch sử không bị xóa.
- [ ] Owner ký exact transaction sau approvals. UI nêu quy trình ứng dụng không phải on-chain multisig; không tuyên bố backend approval ngăn owner gọi trực tiếp.
- [ ] Kiểm toàn bộ endpoints list/detail/export/document/share/mutation theo workspace membership; không chỉ thêm role guard vào UI.

**Gate:** ví workspaceB không đọc/export billA; reviewer không ký chi; old approval không dùng sau đổi recipient; không thể revoke owner cuối cùng; mọi vote ghi người/thời điểm/version.

## Task 11 — Receivables và tiền vào

**Files:** tạo `domain/receivable.ts`, `server/receivables.ts`, `features/receivables/receivables-panel.tsx`, routes `api/receivables/route.ts`, `app/pay-request/[token]/page.tsx`.

- [ ] AR là entity riêng AP, không tái dùng bill paid state. States draft/issued/partially_received/received/overdue/cancelled; overdue derived theo due date và còn nợ.
- [ ] Owner tạo request amount/currency/due/reference, share token opt-in; page công khai tối thiểu, không lộ các request khác.
- [ ] V1 request hiển thị địa chỉ treasury và MUSD chain/token chính xác; receiver nhập txHash và owner review allocation nếu không có on-chain reference.
- [ ] Verify actual Transfer recipient/token/amount/receipt; không tự match chỉ theo amount. Một receipt chia nhiều request phải khóa tổng allocated <= transfer amount.
- [ ] Partial/overpayment hiển thị đúng; thu vượt giữ unallocated credit để owner xử lý, không auto refund.
- [ ] Confirmed receipt cập nhật actual balance/forecast một lần; khoản thu expected hiển thị riêng cho scenario. Cancel invoice không xóa transfer đã nhận.
- [ ] V2 reference-aware payment contract chỉ khi cần auto-match: invoiceId + token/amount + receipt events, triển khai/review riêng; không gắn nhãn đã có ở v1.

**Gate:** reused receipt không double-credit; pending không tính actual; khách trả thiếu vẫn partial; nguồn tiền nhận vào xuất hiện trong statement kể cả chưa phân bổ invoice.

## Task 12 — On-chain enforcement v2 (mở rộng của roles)

**Files:** tạo `contracts/src/MezoraTreasuryV2.sol`, `packages/mezo/src/treasury-v2-abi.ts`, deployment artifact version mới; sửa setup và registry hỗ trợ v1/v2 riêng.

- [ ] Chốt signed payment schema gồm workspace/treasury/chain/nonce/termsHash/amount/recipient/policyVersion/deadline; EIP-712 và signer uniqueness/quorum, hỗ trợ contract signatures nếu cần và đã verify.
- [ ] On-chain spending bounds, allowed action, reserve accounting, pause, nonce consume, policy change có quyền/quorum đúng; không cho policy update mở backdoor bỏ approvals.
- [ ] Review invariants độc lập trước deployment: totalReserved<=balance; pay/cancel nhất quán; duplicate signature/replay không đủ quorum; cross-chain/treasury signature không dùng lại.
- [ ] Treasury cũ immutable không upgrade tại chỗ. Tạo treasury mới, giữ đọc lịch sử cũ; owner xử lý bills/reserves đang mở, rút phần được phép và nạp sang mới bằng giao dịch tách biệt.
- [ ] Migration có checklist và receipts, không tự move funds; không thay binding làm bills cũ mất địa chỉ treasury gốc.

**Gate:** contract và wallet acceptance đạt trước bật; v1 vẫn hoạt động/read được. Không dùng mainnet nếu chỉ có bằng chứng testnet và chưa review phù hợp.

## 5. Kế hoạch kiểm chứng khi triển khai

Không chạy test hay thay code sản phẩm ở lượt lập plan. Khi triển khai, dùng các case cụ thể ở Gate từng task làm acceptance; ưu tiên test cho money/state/idempotency/auth/receipt, không thêm test chỉ soi wording/CSS.

Commands hiện có, chạy từ repo root theo phạm vi thay đổi:

```powershell
npm run typecheck
npm run build
npm test
npm run test:contracts
```

Expected: typecheck/build exit0; tests miền thay đổi pass; contract test chỉ bắt buộc khi đổi Solidity. Không báo pass từ lịch sử thay cho kết quả mới. Browser acceptance dùng scenario trước, live testnet owner review/ký sau; ghi riêng local, deploy, submitted tx và confirmed receipt.

Test files dự kiến cho nghiệp vụ mới: `packages/domain/src/cash-plan.test.ts`, `policy.test.ts`, `statement.test.ts`, `recurrence.test.ts`, `approval.test.ts`, `receivable.test.ts`. DB/API regression bao phủ concurrent imports/allocations, tenant isolation và stale approval; đặt cạnh service theo cấu trúc test thực tế lúc triển khai.

## 6. Deploy, rollback và tiêu chí hoàn tất

- [ ] Mỗi release có diff riêng, migration additive và flag; không deploy nhiều module chưa acceptance cùng lúc.
- [ ] Preview deployment + scenario acceptance → backup DB → apply migration → deploy prod → smoke read-only → owner testnet acceptance nếu có transaction change.
- [ ] Rollback frontend/flag không xóa bảng hay audit. Job retry idempotent; rollback sau broadcast không gửi lại payment, vẫn reconcile receipt.
- [ ] Tài liệu cập nhật gồm schema, limits, UI labels, supported actions, proof links, export schema và license attribution.
- [ ] Tạo demo một studio: import bill → duplicate warning → approve/reserve → forecast thiếu buffer khi repay quá lớn → trả bill → receipt public → statement → recurring draft → khoản thu confirmed cập nhật kế hoạch.
- [ ] Video/deck dùng chức năng thực đã deploy; scenario gắn nhãn; không gọi app policy là contract enforcement.

Definition of done toàn bộ R0–R6: 11 nhóm trong scope có đường dùng hoàn chỉnh, lỗi/retry rõ, không leak tenant, bigint đúng, không double-credit/pay, receipt canonical, không mất lịch sử cũ, người dùng có hướng dẫn. R7 chỉ được đánh dấu done khi contract mới và migration có acceptance riêng.

## 7. Tham khảo và reuse

Receipt/statement: MUSD Books; import/validation: Remitsheet (MIT đã xác minh ở nghiên cứu trước, phải pin commit khi copy). Forecast: học nhịp chi ArcFlow; invoice lifecycle: Faktory; policy: ZeroKey/Intent Firewall; roles: Treasury Anchor; recurring: Hashleap; AI read-only proposal: Autobelay.

Chỉ học pattern với repo chưa kiểm license; không copy code chỉ vì public hoặc đoạt giải. Không mang USDC decimals/Circle wallet/Safe assumptions vào MUSD contract hiện có. UI giữ visual system Mezora, học thao tác rõ và thông tin trước/sau; không đổi brand hay dựng lại toàn bộ trang.

Research inputs: `D:/bitgethackathon/research/mezora-competitive-review-2026-10-25.md` và `D:/bitgethackathon/research/mezora-external-winners-upgrades-2026-10-25.md`.

## 8. Tự rà soát phạm vi

Receipt=Task1; cash-impact=Task3; UX=Task2; forecast=Task4; invoice/payee=Task5; CSV=Task6; statement=Task7; recurring/closing=Task8/7; PDF=Task9; roles=Task10 và enforcement Task12; receivables=Task11. Mỗi module có persistence, authorization boundary, failure/retry và Gate. Chưa triển khai module mới trong lượt lập kế hoạch.
