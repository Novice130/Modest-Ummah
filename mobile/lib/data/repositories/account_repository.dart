import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../core/network/api_client.dart';
import '../models/models.dart';

class AuthResult {
  const AuthResult({required this.token, required this.user});
  final String token;
  final AppUser user;
}

class AccountRepository {
  AccountRepository(this._api);
  final ApiClient _api;

  Future<AuthResult> signIn(String email, String password) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'email': email, 'password': password},
    );
    return AuthResult(
      token: json['token'] as String,
      user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }

  Future<AuthResult> register(String email, String password, String name) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/auth/register',
      data: {'email': email, 'password': password, 'name': name},
    );
    return AuthResult(
      token: json['token'] as String,
      user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }

  Future<AuthResult> signInWithGoogle() async {
    final googleSignIn = GoogleSignIn(
      serverClientId: '488492087162-3gtbu198aonl52qckg9cdnk7s52l6c0a.apps.googleusercontent.com',
    );
    final account = await googleSignIn.signIn();
    if (account == null) throw Exception('Google sign-in cancelled');

    final auth = await account.authentication;
    final idToken = auth.idToken;
    if (idToken == null) throw Exception('Failed to retrieve Google token');

    final json = await _api.post<Map<String, dynamic>>(
      '/auth/google',
      data: {'idToken': idToken},
    );
    return AuthResult(
      token: json['token'] as String,
      user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }

  Future<AuthResult> signInWithApple() async {
    final credential = await SignInWithApple.getAppleIDCredential(
      scopes: [
        AppleIDAuthorizationScopes.email,
        AppleIDAuthorizationScopes.fullName,
      ],
    );

    final name = [credential.givenName, credential.familyName]
        .where((s) => s != null && s.isNotEmpty)
        .join(' ');

    final json = await _api.post<Map<String, dynamic>>(
      '/auth/apple',
      data: {
        'identityToken': credential.identityToken,
        'name': name.isNotEmpty ? name : null,
      },
    );
    return AuthResult(
      token: json['token'] as String,
      user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }

  Future<AppUser> me() async {
    final json = await _api.get<Map<String, dynamic>>('/me');
    return AppUser.fromJson(json);
  }

  Future<AppUser> updateProfile({String? name}) async {
    final json = await _api.patch<Map<String, dynamic>>(
      '/me',
      data: {if (name != null) 'name': name},
    );
    return AppUser.fromJson(json);
  }

  /// Required by App Store Guideline 5.1.1(v). Orders are retained as
  /// financial records but detached from the person server-side.
  Future<void> deleteAccount() => _api.delete<Map<String, dynamic>>('/me');

  Future<List<OrderSummary>> orders() async {
    final json = await _api.get<Map<String, dynamic>>('/orders');
    return ((json['items'] as List?) ?? [])
        .map((e) => OrderSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Map<String, dynamic>>> remoteCart() async {
    final json = await _api.get<Map<String, dynamic>>('/cart');
    return ((json['items'] as List?) ?? []).cast<Map<String, dynamic>>();
  }

  Future<void> saveCart(List<Map<String, dynamic>> items) =>
      _api.put<Map<String, dynamic>>('/cart', data: {'items': items});
}
