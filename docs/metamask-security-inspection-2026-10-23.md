# Kiểm tra cảnh báo MetaMask — Mezora

Ngày: 23/10/2026, Asia/Saigon.

## Kết luận đã xác minh

Dịch vụ quét URL mà mã nguồn MetaMask sử dụng trả HTTP 200 với kết quả sau cho cả `https://mezora.vercel.app` và `/setup`:

```json
{"hostname":"mezora.vercel.app","recommendedAction":"BLOCK"}
```

Đây là phân loại tên miền đã xác nhận độc lập với ảnh người dùng. Response không cung cấp lý do hoặc nhà cung cấp dữ liệu đứng sau quyết định. Chưa đủ bằng chứng để khẳng định đây là false positive, website bị xâm nhập, hay Blockaid là bên đưa ra quyết định.

- [Mã nguồn MetaMask khai báo và gọi dịch vụ quét](https://github.com/MetaMask/core/blob/main/packages/phishing-controller/src/PhishingController.ts)
- Endpoint: `https://dapp-scanning.api.cx.metamask.io/v2/scan?url=https%3A%2F%2Fmezora.vercel.app%2Fsetup`
- Dữ liệu thu trực tiếp: `metamask-security-inspection-2026-10-23.json`.

## Những phần đã kiểm tra

| Phần | Kết quả | Giới hạn |
| --- | --- | --- |
| Vercel | Domain trỏ đến deployment `dpl_GzubhVUxZpdnzA7X6LoiFFgRwJ1p`, trạng thái Ready | Không phải kiểm toán toàn bộ tài khoản Vercel |
| Script trên `/setup` | Các script trực tiếp trong HTML được tải từ cùng origin; bundle setup chứa RPC/explorer/faucet Mezo như mã nguồn | Kiểm tra tĩnh không chứng minh mọi đường chạy đều an toàn |
| Trình duyệt không đăng nhập | Mở `/setup`, `/`, `/repay`; chỉ quan sát request tới domain dự án và Google Fonts; không có request khác GET hoặc lỗi JavaScript | Không có extension MetaMask, không ký hoặc thực thi giao dịch |
| Wallet setup | Request accounts, thêm/chuyển Mezo Testnet, ký message đăng nhập, gửi giao dịch tạo contract với native value bằng 0 | Có phí gas khi thực sự ký deploy |
| Message đăng nhập | Có origin, địa chỉ, chain, nonce và hạn 5 phút; server xác minh chữ ký, chống dùng lại nonce | Định dạng tùy chỉnh, không phải SIWE chuẩn; chưa chứng minh có liên quan đến flag |
| Approve MUSD | Amount cụ thể theo yêu cầu deposit, spender là treasury đã xác minh | Approve vẫn là quyền chi tiêu token và cần được duyệt |
| Treasury | Owner/token immutable; chuyển token có kiểm tra onlyOwner; không thấy hàm thu seed/key, quyền admin rút thay owner hoặc delegatecall trong source được đọc | Chưa phải kiểm toán smart contract đầy đủ |
| Dependency production | `npm audit --omit=dev --json`: 0 advisory được báo | Không phát hiện mọi mã độc hoặc lỗ hổng chưa có advisory |
| Danh sách GitHub eth-phishing-detect | Không thấy domain hoặc parent domain trong blacklist ở snapshot đã đọc | Không đại diện mọi nguồn phân loại live, fuzzy, hotlist, path hoặc cache |

Trong phạm vi này chưa tìm thấy hành vi rút tài sản trái phép rõ ràng. Không thể suy từ đó rằng cảnh báo chắc chắn sai. Chưa biết vì sao tên miền bị phân loại BLOCK.

Header Content-Security-Policy chưa được cấu hình trong response đã kiểm tra. Đây là hạng mục có thể củng cố sau; không có bằng chứng rằng nó gây ra cảnh báo hiện tại.

## Cách xử lý

### So sánh tên miền theo yêu cầu người dùng

Đã thử thêm alias `https://mezora-workspace.vercel.app/setup`, cùng deployment và cùng code. HTTP 200, nhưng dịch vụ quét MetaMask cũng trả `{"hostname":"mezora-workspace.vercel.app","recommendedAction":"BLOCK"}`. Alias sẵn có `mezora-vancongabc955-5514s-projects.vercel.app` cũng bị BLOCK. Vì vậy chưa có bằng chứng rằng đổi tên miền Vercel giải quyết cảnh báo.

Alias mới hiện dùng để đối chiếu trang hiển thị; chưa thêm vào allowlist origin của ứng dụng hoặc chuyển luồng đăng nhập/giao dịch sang alias đó. Không nên diễn giải alias này là một bản đã được nhà cung cấp bảo mật chấp thuận.

Thử tiếp alias không chứa tên Mezora: `https://cedar-business-demo.vercel.app/setup`. Trang trả HTTP 200 nhưng scan cũng trả BLOCK, cả khi truyền URL đầy đủ và hostname. Đối chứng `app.uniswap.org` trả VERIFIED trên cùng endpoint. Nội dung ứng dụng vẫn mang tên Mezora; thử nghiệm này chỉ thay hostname, chưa phân biệt được tác động của nội dung, deployment hoặc nguồn dữ liệu phân loại. Chi tiết lưu ở `metamask-alternate-hostname-2026-10-23.json`.

1. Giữ yêu cầu ví ở trạng thái hủy; không khuyên bỏ qua hoặc tắt bảo vệ.
2. Yêu cầu MetaMask xem xét lại phân loại URL, kèm domain, ảnh, repo công khai và dữ liệu quét. Nếu có cảnh báo thứ hai, bổ sung nội dung của nó.
3. Khi có kết quả review, kiểm tra lại endpoint và cảnh báo thực tế trong extension. Không đổi domain chỉ để tránh cảnh báo.

[Hướng dẫn chính thức về cảnh báo và yêu cầu xem xét](https://support.metamask.io/configure/wallet/security-alerts). Với URL scan, hướng dẫn hiện tại yêu cầu liên hệ support để manual review. Chưa gửi báo cáo hoặc liên hệ bên ngoài thay người dùng.

## Nội dung tiếng Anh để gửi yêu cầu review

> Please review the security classification of https://mezora.vercel.app and https://mezora.vercel.app/setup. MetaMask displays a “Malicious site” warning. Your public dapp-scanning endpoint currently returns {"hostname":"mezora.vercel.app","recommendedAction":"BLOCK"}, without a reason. Mezora is a Mezo Testnet business treasury prototype. Source: https://github.com/maixuancanh/mezora/tree/build/mezora-mvp (inspected source commit d068799). Treasury setup requests account access, Mezo Testnet chain addition/switching (chain ID 31611), an off-chain login signature with an origin-bound expiring nonce, and an owner-controlled contract deployment with zero native value, excluding gas. Deposits use exact-amount MUSD approvals to the verified treasury. The site never requests a seed phrase or private key. Please identify the classification reason and review whether it is incorrect. We are not asking users to disable protection or bypass the alert. A screenshot and captured scan response are available.
