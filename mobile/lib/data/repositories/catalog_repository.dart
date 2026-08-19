import '../../core/network/api_client.dart';
import '../models/models.dart';

class CatalogRepository {
  CatalogRepository(this._api);
  final ApiClient _api;

  Future<Paged<Product>> products({
    int page = 1,
    int perPage = 24,
    String? categorySlug,
    String? tagSlug,
    String? sort,
    bool inStockOnly = false,
  }) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/products',
      query: {
        'page': page,
        'perPage': perPage,
        if (categorySlug != null) 'category': categorySlug,
        if (tagSlug != null) 'tag': tagSlug,
        if (sort != null) 'sort': sort,
        if (inStockOnly) 'inStock': 'true',
      },
    );
    return Paged.fromJson(json, Product.fromJson);
  }

  Future<Paged<Product>> search(String query) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/products',
      query: {'q': query},
    );
    return Paged.fromJson(json, Product.fromJson);
  }

  Future<Product> product(String slug) async {
    final json = await _api.get<Map<String, dynamic>>('/products/$slug');
    return Product.fromJson(json);
  }

  Future<List<Product>> related(String slug) async {
    final json = await _api.get<Map<String, dynamic>>('/products/$slug/related');
    return ((json['items'] as List?) ?? [])
        .map((e) => Product.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Product>> newArrivals({int limit = 8}) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/products/new-arrivals',
      query: {'limit': limit},
    );
    return ((json['items'] as List?) ?? [])
        .map((e) => Product.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Category>> categories() async {
    final json = await _api.get<Map<String, dynamic>>('/categories');
    return ((json['items'] as List?) ?? [])
        .map((e) => Category.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TagRef>> tags() async {
    final json = await _api.get<Map<String, dynamic>>('/tags');
    return ((json['items'] as List?) ?? [])
        .map((e) => TagRef.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
