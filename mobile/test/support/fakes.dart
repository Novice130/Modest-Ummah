import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:modest_ummah/core/network/api_client.dart';
import 'package:modest_ummah/core/providers/providers.dart';
import 'package:modest_ummah/core/storage/secure_store.dart';

class FakeSecureStore extends SecureStore {
  FakeSecureStore([this.token]);

  String? token;

  @override
  Future<String?> readToken() async => token;

  @override
  Future<void> writeToken(String value) async => token = value;

  @override
  Future<void> clearToken() async => token = null;
}

class FakeResponse {
  const FakeResponse(this.status, this.body);
  final int status;
  final Object? body;
}

class RecordedRequest {
  const RecordedRequest(this.method, this.path, this.authorization, this.data);
  final String method;
  final String path;
  final String? authorization;
  final Object? data;
}

/// Answers every request in-process, so nothing using it can reach a network.
/// A handler that throws a [DioException] stands in for being offline.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler);

  FakeResponse Function(RecordedRequest request) handler;
  final requests = <RecordedRequest>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final request = RecordedRequest(
      options.method,
      options.uri.path,
      options.headers['Authorization'] as String?,
      options.data,
    );
    requests.add(request);
    final response = handler(request);
    return ResponseBody.fromString(
      jsonEncode(response.body),
      response.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

DioException offline(RecordedRequest request) => DioException(
      requestOptions: RequestOptions(path: request.path),
      type: DioExceptionType.connectionError,
    );

/// The same wiring as production, except for the store and the transport.
List<Override> offlineOverrides(FakeSecureStore store, FakeAdapter adapter) => [
      secureStoreProvider.overrideWithValue(store),
      apiClientProvider.overrideWith(
        (ref) => ApiClient(
          store: ref.watch(secureStoreProvider),
          httpAdapter: adapter,
          onUnauthenticated: () =>
              ref.read(authProvider.notifier).signOutLocally(),
        ),
      ),
    ];

/// A body for GET /me, and for the `user` field of a sign-in response.
Map<String, dynamic> userJson(String id) =>
    {'id': id, 'email': '$id@example.test', 'name': id};

Map<String, dynamic> orderJson(String orderId, {String status = 'processing'}) => {
      'id': orderId,
      'orderId': orderId,
      'items': const [],
      'total': '10.00',
      'status': status,
      'paymentStatus': 'paid',
      'createdAt': '2026-10-01T00:00:00.000Z',
    };
