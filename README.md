# Timemark_Sirinono

Máy ảnh đóng dấu thời gian: chụp ảnh và in **giờ, ngày, thứ, địa chỉ, tọa độ GPS, thời tiết, dự án, người chụp, ghi chú và mã ảnh** trực tiếp lên ảnh. Viết mới hoàn toàn (không dùng mã của ứng dụng khác), chạy được trên trình duyệt (PWA) và trên Android (APK).

## Tính năng

- Camera trực tiếp, xem trước watermark đúng như ảnh sẽ lưu (WYSIWYG), cập nhật mỗi giây.
- 5 mẫu watermark: **Cổ điển**, **Công việc** (bảng báo cáo hiện trường), **Thẻ trắng**, **Đơn giản**, **Máy film**.
- Chọn vị trí (4 góc), cỡ chữ (60–160%), màu nhấn; bật/tắt từng thông tin.
- GPS liên tục, địa chỉ tự động (OpenStreetMap Nominatim), thời tiết hiện tại (Open-Meteo) – không cần API key. Có thể nhập địa chỉ thủ công.
- Đổi camera trước/sau, đèn flash (nếu máy hỗ trợ), thu phóng, lưới 3×3, hẹn giờ 3/10 giây, âm chụp; trên APK có thể chụp bằng **nút âm lượng**.
- **Nhập ảnh** có sẵn để đóng dấu (dùng thời gian hiện tại hoặc thời gian của tệp).
- Thư viện trong ứng dụng (IndexedDB, dùng offline), xem chi tiết, lưu về máy, chia sẻ, xóa.
- APK: ảnh được lưu vào **Pictures/Timemark_Sirinono** trong Thư viện ảnh của điện thoại.
- Mỗi ảnh có **mã ảnh** 8 ký tự tính từ thời gian + tọa độ lúc chụp.

## Chạy bản web

```bash
npm start          # http://localhost:8080
npm test           # kiểm thử định dạng/thông tin watermark
```

Camera và GPS chỉ hoạt động trên `https://` hoặc `http://localhost`. Có thể đưa nguyên thư mục gốc (index.html, manifest.json, sw.js, css, js, icons) lên GitHub Pages / Cloudflare Pages.

## Build APK Android

Yêu cầu JDK 17 và Android SDK (platform 34).

```bash
cd android
./gradlew assembleDebug     # android/app/build/outputs/apk/debug/app-debug.apk
```

Ứng dụng Android là WebView bọc chính bản web ở thư mục gốc (được chép vào APK khi build). Quyền: Camera, Vị trí, Internet (lấy địa chỉ/thời tiết), Bộ nhớ (chỉ Android 9 trở xuống).

Để build bản release đã ký, tạo `android/keystore.properties` (không commit) với `storeFile`, `storePassword`, `keyAlias`, `keyPassword`, rồi chạy `./gradlew assembleRelease`.

## Giới hạn

- Thời gian lấy từ đồng hồ của máy; mã ảnh giúp đối chiếu nhưng không phải chứng thực chống giả mạo.
- Địa chỉ và thời tiết cần mạng; khi offline chỉ có tọa độ GPS.
- Không có tài khoản/đồng bộ nhóm, báo cáo đám mây như ứng dụng thương mại.

## Cấu trúc

| Tệp | Vai trò |
| --- | --- |
| `js/app.js` | Giao diện, camera, chụp, thư viện |
| `js/watermark.js` | Vẽ 5 mẫu watermark lên canvas |
| `js/format.js` | Định dạng giờ/ngày/tọa độ, mã ảnh, thông tin hiển thị |
| `js/location.js` | GPS, địa chỉ, thời tiết |
| `js/gallery.js` | Lưu ảnh trong IndexedDB |
| `js/native.js` | Lưu/chia sẻ qua cầu nối Android hoặc trình duyệt |
| `js/settings.js` | Cài đặt và mẫu |
| `android/` | Ứng dụng Android (WebView + `PhotoBridge`) |
