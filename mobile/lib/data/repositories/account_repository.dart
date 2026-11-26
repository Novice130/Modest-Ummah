import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/services.dart' show PlatformException;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../core/network/api_client.dart';
import '../models/models.dart';

class AuthResult {
  const AuthResult({required this.token, required this.user});
  final String token;
  final AppUser user;
}

/// The customer closed the Google or Apple sheet. Not a fault, and its text is
/// what the sign-in screen shows.
class SignInCancelled implements Exception {
  const SignInCancelled();

  @override
  String toString() => 'Sign-in cancelled. Choose an option to try again.';
}

/// The native Google or Apple step failed. The detail goes to the debug log;
/// the customer gets a sentence they can act on.
class SocialSignInFailed implements Exception {
  const SocialSignInFailed(this.provider);

  final String provider;

  @override
  String toString() =>
      '$provider sign-in could not be completed. Please try again, or use your email.';
}

/// What the native Apple sheet hands back.
class AppleSignIn {
  const AppleSignIn({required this.identityToken, required this.name});
  final String? identityToken;
  final String? name;
}

Future<String?> _nativeGoogleIdToken() async {
  final googleSignIn = GoogleSignIn(
    serverClientId: '488492087162-3gtbu198aonl52qckg9cdnk7s52l6c0a.apps.googleusercontent.com',
  );
  final account = await googleSignIn.signIn();
  if (account == null) return null;
  final auth = await account.authentication;
  // A null token after a chosen account is a failure, not a cancellation.
  if (auth.idToken == null) throw const SocialSignInFailed('Google');
  return auth.idToken;
}

Future<AppleSignIn> _nativeAppleSignIn() async {
  final credential = await SignInWithApple.getAppleIDCredential(
    scopes: [
      AppleIDAuthorizationScopes.email,
      AppleIDAuthorizationScopes.fullName,
    ],
  );
  final name = [credential.givenName, credential.familyName]
      .where((s) => s != null && s.isNotEmpty)
      .join(' ');
  return AppleSignIn(
    identityToken: credential.identityToken,
    name: name.isNotEmpty ? name : null,
  );
}

class AccountRepository {
  AccountRepository(
    this._api, {
    Future<String?> Function()? googleIdToken,
    Future<AppleSignIn> Function()? appleSignIn,
  })  : _googleIdToken = googleIdToken ?? _nativeGoogleIdToken,
        _appleSignIn = appleSignIn ?? _nativeAppleSignIn;

  final ApiClient _api;
  final Future<String?> Function() _googleIdToken;
  final Future<AppleSignIn> Function() _appleSignIn;

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

  /// Runs a native sign-in sheet, turning whatever it throws into the two
  /// outcomes the sign-in screen can show.
  Future<T> _native<T>(String provider, Future<T> Function() sheet) async {
    try {
      return await sheet();
    } on SignInCancelled {
      rethrow;
    } on SocialSignInFailed {
      rethrow;
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) throw const SignInCancelled();
      debugPrint('$provider sign-in failed: $e');
      throw SocialSignInFailed(provider);
    } on PlatformException catch (e) {
      if (e.code.contains('cancel')) throw const SignInCancelled();
      debugPrint('$provider sign-in failed: $e');
      throw SocialSignInFailed(provider);
    } catch (e) {
      debugPrint('$provider sign-in failed: $e');
      throw SocialSignInFailed(provider);
    }
  }

  Future<AuthResult> signInWithGoogle() async {
    final idToken = await _native('Google', _googleIdToken);
    if (idToken == null) throw const SignInCancelled();

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
    final credential = await _native('Apple', _appleSignIn);
    if (credential.identityToken == null) throw const SocialSignInFailed('Apple');

    final json = await _api.post<Map<String, dynamic>>(
      '/auth/apple',
      data: {
        'identityToken': credential.identityToken,
        'name': credential.name,
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

  /// Excludes rows still awaiting payment: those are checkouts that were
  /// started, and usually abandoned, not orders the customer placed.
  Future<List<OrderSummary>> orders() async {
    final json = await _api.get<Map<String, dynamic>>('/orders');
    return ((json['items'] as List?) ?? [])
        .map((e) => OrderSummary.fromJson(e as Map<String, dynamic>))
        .where((order) => !order.isAwaitingPayment)
        .toList();
  }

  Future<List<Map<String, dynamic>>> remoteCart() async {
    final json = await _api.get<Map<String, dynamic>>('/cart');
    return ((json['items'] as List?) ?? []).cast<Map<String, dynamic>>();
  }

  Future<void> saveCart(List<Map<String, dynamic>> items) =>
      _api.put<Map<String, dynamic>>('/cart', data: {'items': items});
}
