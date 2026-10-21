# BẢNG PHIÊN BẢN CÔNG CỤ VÀ DOCKER IMAGE
* **MSSV**: DTC245180162
* **Họ và tên**: Lý Văn Hưng
* **Lớp**: KTPM K23B
* **Dự án**: Hệ thống Quản lý Câu lạc bộ (Club Management System)

## 1. Công cụ hệ thống (Ubuntu 24.04.4 LTS VM)
| Công cụ | Phiên bản thực tế | Trạng thái kiểm tra |
| :--- | :--- | :--- |
| Ubuntu OS | 24.04.4 LTS (Noble Numbat) | Hoạt động |
| Docker Engine | 29.1.3 | Hoạt động (\`hello-world\` thành công) |
| Docker Compose | 2.40.3 | Hoạt động |
| Git | 2.43.0 | Hoạt động |
| OpenSSL | 3.0.13 | Hoạt động |
| Curl | 8.5.0 | Hoạt động |
| UFW | 0.36.2 (inactive) | Hoạt động |
| jq | 1.7 | Hoạt động |
| tree | 2.1.1 | Hoạt động |

## 2. Docker Images dự kiến (tag cố định, không dùng latest/trôi)
| Dịch vụ | Image & Tag cố định | Ghi chú |
| :--- | :--- | :--- |
| Web Application | \`node:20.18.0-alpine3.20\` | Node.js LTS |
| Database | \`mysql:8.0.39\` | MySQL 8 LTS |
| Reverse Proxy | \`nginx:1.26.2-alpine\` | Nginx HTTP/HTTPS |
| Prometheus | \`prom/prometheus:v2.54.1\` | Giám sát metrics |
| Grafana | \`grafana/grafana:11.2.0\` | Dashboard giám sát |
| Node Exporter | \`prom/node-exporter:v1.8.2\` | Thu thập metrics host/VM |
| cAdvisor | \`gcr.io/cadvisor/cadvisor:v0.49.1\` | Giám sát container |
| MySQL Exporter | \`prom/mysqld-exporter:v0.15.1\` | Giám sát database |
| Loki | \`grafana/loki:3.1.1\` | Lưu trữ log |
| Promtail | \`grafana/promtail:3.1.1\` | Thu thập log gửi Loki |
