# Android Application Scaffold

The backend is API-first and can be consumed by a Flutter Android app.

Recommended Flutter screens:

- Login with JWT token storage and optional OTP/MFA step.
- Security app: RFID scan, QR scan, truck entry, document capture, offline queue, voice note attachment.
- Officer app: live dashboard, manual ERV approval, mismatch resolution, YM89 report view, alert center.

Minimal Flutter package plan:

- `dio` for REST APIs.
- `mobile_scanner` for QR.
- `flutter_secure_storage` for JWT.
- `connectivity_plus` and `sqflite` for offline queue.
- `firebase_messaging` or Azure Notification Hubs for push notifications.

API base URL:

```dart
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://lpg-gate.example.com/api',
);
```

APK build command after Flutter SDK setup:

```powershell
flutter create indane_lpg_gate_app
flutter pub add dio mobile_scanner flutter_secure_storage connectivity_plus sqflite firebase_messaging
flutter build apk --release --dart-define=API_BASE_URL=https://your-public-domain/api
```
