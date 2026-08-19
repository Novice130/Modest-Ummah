import 'package:dio/dio.dart';
import '../storage/secure_store.dart';
import 'api_config.dart';

/// Thrown for anything the UI needs to show a human message for.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.code});

  final String message;
  final int? statusCode;
  final String? code;

  bool get isUnauthenticated => statusCode == 401;
  bool get isNotFound => statusCode == 404;

  @override
  String toString() => message;
}

/// The single Dio instance. Attaches the bearer token, and reports a 401 once
/// so the app can drop the session and send the customer to sign-in.
class ApiClient {
  ApiClient({required SecureStore store, this.onUnauthenticated})
      : _store = store {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConfig.apiBase,
        connectTimeout: const Duration(seconds: 12),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Accept': 'application/json'},
        // Let non-2xx through to the error interceptor rather than throwing
        // on a 404, which several screens treat as a normal outcome.
        validateStatus: (status) => status != null && status < 500,
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _store.readToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  final SecureStore _store;
  final Future<void> Function()? onUnauthenticated;
  late final Dio _dio;

  Future<T> _handle<T>(Future<Response<dynamic>> Function() send) async {
    late Response<dynamic> res;
    try {
      res = await send();
    } on DioException catch (e) {
      throw ApiException(
        switch (e.type) {
          DioExceptionType.connectionTimeout ||
          DioExceptionType.receiveTimeout ||
          DioExceptionType.sendTimeout =>
            'The connection timed out. Check your signal and try again.',
          DioExceptionType.connectionError =>
            'Could not reach Modest Ummah. Check your connection.',
          _ => 'Something went wrong. Please try again.',
        },
      );
    }

    final status = res.statusCode ?? 0;
    if (status >= 200 && status < 300) return res.data as T;

    if (status == 401) {
      await onUnauthenticated?.call();
    }

    // The API's error envelope is { error: { message, code } }; the older
    // routes return { error: "message" }.
    final body = res.data;
    String message = 'Something went wrong. Please try again.';
    String? code;
    if (body is Map) {
      final error = body['error'];
      if (error is Map) {
        message = (error['message'] as String?) ?? message;
        code = error['code'] as String?;
      } else if (error is String) {
        message = error;
      }
    }
    throw ApiException(message, statusCode: status, code: code);
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) =>
      _handle<T>(() => _dio.get(path, queryParameters: query));

  Future<T> post<T>(String path, {Object? data}) =>
      _handle<T>(() => _dio.post(path, data: data));

  Future<T> put<T>(String path, {Object? data}) =>
      _handle<T>(() => _dio.put(path, data: data));

  Future<T> patch<T>(String path, {Object? data}) =>
      _handle<T>(() => _dio.patch(path, data: data));

  Future<T> delete<T>(String path) => _handle<T>(() => _dio.delete(path));
}
