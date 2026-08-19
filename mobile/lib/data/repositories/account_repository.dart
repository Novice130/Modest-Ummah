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
