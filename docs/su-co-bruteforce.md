# Kịch bản ứng phó: nhiều lần đăng nhập thất bại

## Mục tiêu và phạm vi

Kịch bản mô phỏng nhiều lần đăng nhập sai vào chính ứng dụng Club Management. Script `scripts/simulate-login-failures.py` mặc định gửi tối đa 8 POST tới `https://127.0.0.1/auth/login`, dùng tài khoản giả không tồn tại và mật khẩu thử nghiệm cố định. Script chỉ chấp nhận HTTPS trên loopback hoặc IP riêng của VM, từ chối hostname và IP công khai, lấy CSRF token và cookie từ trang đăng nhập, đồng thời yêu cầu tối thiểu 5 phản hồi của ứng dụng và một HTTP 429 để xác nhận cả hai đường đi.

Chạy trên VM sau khi Docker hoạt động:

```sh
python3 scripts/simulate-login-failures.py
```

Nếu chạy từ máy khác trong mạng riêng, chỉ định IP riêng của VM:

```sh
BASE_URL=https://<PRIVATE_VM_IP> python3 scripts/simulate-login-failures.py
```

Chứng chỉ trong môi trường này tự ký; script bỏ qua kiểm tra CA nhưng vẫn giới hạn URL theo IP loopback/mạng riêng. Không dùng script với hệ thống bên thứ ba.

## Phát hiện và truy vết

Ứng dụng ghi JSON `LOGIN_FAILED` hoặc `LOGIN_SUCCESS` với `timestamp`, địa chỉ nguồn, username đã giới hạn/chuẩn hóa và lý do tĩnh. Không ghi mật khẩu, cookie, token hoặc secret. Nginx ghi JSON access log với thời gian, IP, URI không kèm query string, mã HTTP và thời gian xử lý. IP và username chỉ nằm trong nội dung log, không được dùng làm nhãn Loki.

Promtail gắn nhãn có cardinality thấp `container`, `compose_service`, `job`; log ứng dụng dùng `job="webapp"`, access log dùng `job="nginx"`, và receiver dùng `job="alert-sink"`. Grafana provision alert `Club login brute-force attempts` khi có hơn 4 lần đăng nhập thất bại trong một phút. Alert severity `critical` được gửi tới webhook nội bộ `alert-sink`; receiver chỉ ghi summary, description, nhãn alert và thời gian ra stdout.

Promtail Docker service discovery cần Docker socket. Mount socket `:ro` không giới hạn các API request tới daemon; coi Promtail như thành phần có quyền quản trị host, chỉ dùng image tin cậy và không mở các endpoint nội bộ ra ngoài.

LogQL để điều tra (chạy trong Grafana Explore với datasource Loki):

```logql
{job="webapp"} | json | event="LOGIN_FAILED"
{job="webapp"} | json | event="LOGIN_FAILED" | ip="127.0.0.1"
sum(count_over_time({job="webapp"} | json | event="LOGIN_FAILED" [1m]))
{job="nginx"} | json | status="429"
{job="alert-sink"} | json | event="ALERT_RECEIVED"
```

Thay IP theo trường `ip` thực tế. Chọn cùng time range để đối chiếu timestamp, user, IP và mã HTTP. Với schema JSON do Nginx ghi, `status` là trường JSON được parser trích xuất.

## Xử lý

1. Trong Explore, xác định số lượng `LOGIN_FAILED`, username mục tiêu và địa chỉ nguồn; đối chiếu Nginx 429/5xx trong cùng khoảng thời gian.
2. Nếu là kiểm thử được phê duyệt, ghi nhận thời điểm và xác nhận alert tới `alert-sink`; không coi log receiver là bằng chứng nếu chưa xem log thật.
3. Nếu không được phê duyệt, rà soát tài khoản bị nhắm đến qua audit log, khóa hoặc đổi mật khẩu theo quy trình quản trị, đánh giá các lần đăng nhập thành công cùng nguồn/thời gian và bảo toàn log.
4. Nginx giới hạn POST `/auth/login` theo IP ở 10 request/phút, burst 5; response vượt ngưỡng là 429. Có thể cần điều chỉnh ngưỡng nếu nhiều người dùng hợp lệ dùng chung NAT.

## Bằng chứng runtime

Đã kiểm tra riêng tiến trình Node.js của alert-sink trên máy phát triển: `/health` trả HTTP 200, webhook tổng hợp trả HTTP 202, JSON sai trả HTTP 400, và stdout ghi `ALERT_RECEIVED`. Đây không phải webhook do Grafana gửi và không xác minh Loki/Promtail.

Docker Engine chưa phản hồi trong môi trường phát triển hiện tại; vì vậy chưa chạy script đăng nhập, chưa truy vấn Loki, chưa thấy Grafana alert Firing, chưa kiểm tra HTTP 429 hoặc đầu-cuối alert-sink qua Grafana. Không ghi các kết quả dự kiến như kết quả đã quan sát. Ghi lại kết quả thật vào `evidence/buoc5-logql.txt` và `evidence/buoc5-sucodo.txt` sau khi chạy trên VM.

## Bài học

- Ghi sự kiện đăng nhập theo cấu trúc giúp truy vấn nhất quán nhưng không được đưa dữ liệu xác thực vào log.
- Dùng IP/user để điều tra ở nội dung log; tránh label cardinality cao.
- Alert cần được đối chiếu với access log và audit trail; 429 là biện pháp giảm tốc độ, không chứng minh danh tính hay ngăn mọi hành vi.
- Kịch bản kiểm thử phải giới hạn mục tiêu, số lần thử, tài khoản giả và có thể lặp lại mà không làm thay đổi dữ liệu người dùng.
