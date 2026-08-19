import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Keychain-backed storage for the session token.
///
/// Deliberately not SharedPreferences: that is an unencrypted plist, and a
/// JWT that authenticates a customer's orders and addresses does not belong
/// there.
class SecureStore {
  static const _tokenKey = 'auth_token';

  static const _storage = FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<void> writeToken(String token) =>
      _storage.write(key: _tokenKey, value: token);

  Future<void> clearToken() => _storage.delete(key: _tokenKey);
}
