# Kiểm tra website và contract sau cảnh báo MetaMask

Ngày: 23/10/2026. Source đang xem: commit `d068799`. Phạm vi: kiểm tra mã nguồn, artifact, đọc testnet và chạy các test sẵn có; không ký/broadcast giao dịch.

**Cập nhật sau review:** các điểm gia cố frontend, account/network, CSP và SIWE nêu bên dưới đã được triển khai trong deployment `dpl_3oxpveXXAe7jvfTCZ8C4TuH8oDDq`. Xem `security-hardening-2026-10-23.md`. Phần nhận xét bên dưới giữ nguyên như bản review trước khi sửa.

## Kết luận

Chưa tìm thấy mã thu seed/private key, spender lạ, approve vô hạn hoặc đường rút treasury của người khác trong phần đã đọc. Contract MUSD được cấu hình đúng địa chỉ chính thức. Chưa có bằng chứng rằng contract Mezo gây cảnh báo Malicious site. Đây không phải kết luận kiểm toán đầy đủ hoặc xác nhận false positive.

## Bằng chứng trực tiếp

- MetaMask URL scan trả BLOCK cho hostname ngay khi gọi dịch vụ quét URL; request này không chứa địa chỉ contract hoặc calldata. Nhà cung cấp có thể dùng dữ liệu khác ở backend; response không nêu lý do.
- Trình duyệt không đăng nhập đã quan sát `/`, `/setup`, `/repay`: chỉ request tới origin dự án và Google Fonts. Không có request khác GET hoặc lỗi JavaScript trong lần quan sát. Xem `security-browser-inspection-2026-10-23.json`.
- `npm test`: 8 file / 41 test pass.
- `forge test --root contracts`: 18 test pass, gồm fuzz 256 lượt và invariant 128 lượt / 8.192 calls. Các test này kiểm tra treasury của dự án, không kiểm toán toàn bộ protocol Mezo.
- Artifact đang phân phối `packages/mezo/src/treasury-build.json` khớp creation bytecode, runtime bytecode và immutable references của `contracts/out/MezoraTreasury.sol/MezoraTreasury.json` sau Forge compile.
- `scripts/verify-testnet.ts`: chain 31611; MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`; symbol MUSD; decimals 18; code 6.437 bytes; block 16309025.
- `scripts/verify-trove.ts 0x6A613e758D77c46B6E74971F7481dd66b59fE33a`: tại block 16309018, kiểm tra liên kết protocol và 6 implementation slot ghim đều qua. PriceFeed trả giá dương, không revert trong lần đọc trực tiếp này. Ví không có Trove, có 0 MUSD và 0,05 BTC testnet. Chưa mô phỏng hoặc thực thi repay cho borrower có nợ.

## Đối chiếu Mezo

Nguồn chính thức:

- [MUSD testnet theo tài liệu Mezo](https://mezo.org/docs/users/resources/contracts-reference).
- [Deployment Matsnet ghim commit](https://github.com/mezo-org/musd/tree/b51f6cb8e0f048770e32cb6ab5d704785e0b75b1/solidity/artifacts/deployments/matsnet).
- [MUSD source](https://github.com/mezo-org/musd/blob/b51f6cb8e0f048770e32cb6ab5d704785e0b75b1/solidity/contracts/token/MUSD.sol).
- [BorrowerOperations source](https://github.com/mezo-org/musd/blob/b51f6cb8e0f048770e32cb6ab5d704785e0b75b1/solidity/contracts/BorrowerOperations.sol).

| Contract | Địa chỉ cấu hình / deployment chính thức |
| --- | --- |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| BorrowerOperations | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| PriceFeed | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` |

MUSD có danh sách quyền mint/burn do owner quản lý; protocol proxy có quyền upgrade. Đây là giả định tin cậy/quản trị thực sự, không thể gọi token hoàn toàn không có quyền quản trị. Riêng burn không cần allowance nhưng bị giới hạn caller trong burnList. BorrowerOperations.repayMUSD dùng msg.sender làm borrower và nguồn trả nợ. Chưa thấy việc app gọi burn trực tiếp hoặc xin quyền mint/burn.

Read kiểm tra địa chỉ và implementation slot không chứng minh implementation của Mezo không có lỗ hổng. Không chạy kiểm toán toàn bộ Mezo hay xác minh bytecode mọi dependency với source.

## Điểm cần gia cố trong app

1. **Frontend chưa đối chiếu đầy đủ calldata trước khi ký.** `workspace.tsx` kiểm tra metadata amount/recipient/action/to nhưng chưa decode transaction.data để bảo đảm payload khớp metadata. `/setup` kiểm tra dạng hex của deployment data nhưng chưa tự tính constructor bytecode chuẩn ở client. Nếu API bị sửa hoặc xâm nhập, metadata có thể đúng nhưng payload khác. Backend hiện có kiểm tra và receipt reconciliation, nhưng kiểm tra sau broadcast không ngăn được chữ ký sai. Đây là thiếu lớp bảo vệ độc lập, chưa phải bằng chứng đang có payload độc hại.
2. **Workspace chưa đọc lại account và chain sau yêu cầu đổi mạng ngay trước send.** Setup đã kiểm tra lại; workspace còn dùng luồng cũ. Cần thống nhất helper và kiểm tra account/chain lần cuối.
3. **Chưa có Content-Security-Policy trong response đã xem.** Nên thêm chính sách phù hợp Next.js sau khi kiểm tra script/style thực tế. Không có bằng chứng đây là lý do bị BLOCK.
4. **Message đăng nhập dùng định dạng tùy chỉnh.** Có origin, nonce dùng một lần và expiry; có thể chuyển sang SIWE chuẩn để ví nhận diện rõ hơn. Chưa có bằng chứng định dạng này gây flag.

Các điểm trên là hạng mục gia cố được phát hiện khi đọc source; chưa sửa trong lần review này và không được trình bày như nguyên nhân đã xác minh của cảnh báo.

## Việc còn chưa biết

Lý do cụ thể của kết quả BLOCK, nhà cung cấp gắn cờ, lịch sử reputation của domain, cảnh báo thứ hai trong popup, và kết quả review của MetaMask. Không nên gán lỗi cho Mezo hoặc bảo đảm website an toàn chỉ dựa trên các test pass.
