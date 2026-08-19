import '../../core/network/api_config.dart';

/// Hand-written models rather than freezed/json_serializable codegen.
///
/// The payloads are small and stable, and the app has exactly one consumer of
/// each. Codegen would add a build_runner step to every edit for no real
/// safety here — the parsing below is defensive about nulls, which is the
/// part that actually breaks.

class ApiImage {
  const ApiImage({
    required this.url,
    required this.alt,
    required this.width,
    required this.height,
    required this.lqip,
  });

  final String url;
  final String alt;
  final int width;
  final int height;

  /// base64 data URI, ~24px wide. Empty for admin uploads predating the
  /// import pipeline, in which case the UI falls back to a flat placeholder.
  final String lqip;

  String get absoluteUrl => ApiConfig.resolveMedia(url);
  double get aspectRatio => height == 0 ? 0.8 : width / height;

  factory ApiImage.fromJson(Map<String, dynamic> json) => ApiImage(
        url: json['url'] as String? ?? '',
        alt: json['alt'] as String? ?? '',
        width: (json['w'] as num?)?.toInt() ?? 1600,
        height: (json['h'] as num?)?.toInt() ?? 2000,
        lqip: json['lqip'] as String? ?? '',
      );
}

class TagRef {
  const TagRef({required this.id, required this.name, required this.slug});

  final String id;
  final String name;
  final String slug;

  factory TagRef.fromJson(Map<String, dynamic> json) => TagRef(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String? ?? '',
      );
}

class CategoryRef {
  const CategoryRef({
    required this.id,
    required this.name,
    required this.slug,
    required this.path,
  });

  final String id;
  final String name;
  final String slug;

  /// Root-first, including the category itself — the breadcrumb.
  final List<TagRef> path;

  factory CategoryRef.fromJson(Map<String, dynamic> json) => CategoryRef(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String? ?? '',
        path: ((json['path'] as List?) ?? [])
            .map((e) => TagRef.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class Product {
  const Product({
    required this.id,
    required this.slug,
    required this.name,
    required this.shortDescription,
    required this.description,
    required this.price,
    required this.compareAtPrice,
    required this.onSale,
    required this.sku,
    required this.inStock,
    required this.category,
    required this.tags,
    required this.images,
  });

  final String id;
  final String slug;
  final String name;
  final String shortDescription;
  final String description;

  /// Kept as the string the API sends. Money is decimal(10,2) server-side and
  /// round-tripping it through a double is how currencies drift.
  final String price;
  final String? compareAtPrice;
  final bool onSale;

  final String sku;
  final bool inStock;
  final CategoryRef? category;
  final List<TagRef> tags;
  final List<ApiImage> images;

  ApiImage? get primaryImage => images.isEmpty ? null : images.first;

  String get displayPrice => '\$$price';
  String? get displayCompareAt =>
      compareAtPrice == null ? null : '\$$compareAtPrice';

  double get priceValue => double.tryParse(price) ?? 0;

  factory Product.fromJson(Map<String, dynamic> json) => Product(
        id: json['id'] as String? ?? '',
        slug: json['slug'] as String? ?? '',
        name: json['name'] as String? ?? '',
        shortDescription: json['shortDescription'] as String? ?? '',
        description: json['description'] as String? ?? '',
        price: json['price'] as String? ?? '0.00',
        compareAtPrice: json['compareAtPrice'] as String?,
        onSale: json['onSale'] as bool? ?? false,
        sku: json['sku'] as String? ?? '',
        inStock: json['inStock'] as bool? ?? true,
        category: json['category'] == null
            ? null
            : CategoryRef.fromJson(json['category'] as Map<String, dynamic>),
        tags: ((json['tags'] as List?) ?? [])
            .map((e) => TagRef.fromJson(e as Map<String, dynamic>))
            .toList(),
        images: ((json['images'] as List?) ?? [])
            .map((e) => ApiImage.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class Category {
  const Category({
    required this.id,
    required this.name,
    required this.slug,
    required this.description,
    required this.image,
    required this.children,
  });

  final String id;
  final String name;
  final String slug;
  final String description;
  final String? image;
  final List<Category> children;

  String? get absoluteImage =>
      image == null ? null : ApiConfig.resolveMedia(image!);

  factory Category.fromJson(Map<String, dynamic> json) => Category(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String? ?? '',
        description: json['description'] as String? ?? '',
        image: json['image'] as String?,
        children: ((json['children'] as List?) ?? [])
            .map((e) => Category.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class Paged<T> {
  const Paged({
    required this.items,
    required this.page,
    required this.perPage,
    required this.totalItems,
    required this.totalPages,
  });

  final List<T> items;
  final int page;
  final int perPage;
  final int totalItems;
  final int totalPages;

  bool get hasMore => page < totalPages;

  factory Paged.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) parse,
  ) =>
      Paged(
        items: ((json['items'] as List?) ?? [])
            .map((e) => parse(e as Map<String, dynamic>))
            .toList(),
        page: (json['page'] as num?)?.toInt() ?? 1,
        perPage: (json['perPage'] as num?)?.toInt() ?? 0,
        totalItems: (json['totalItems'] as num?)?.toInt() ?? 0,
        totalPages: (json['totalPages'] as num?)?.toInt() ?? 1,
      );
}

class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.name,
    this.avatar,
  });

  final String id;
  final String email;
  final String name;
  final String? avatar;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String? ?? '',
        email: json['email'] as String? ?? '',
        name: json['name'] as String? ?? '',
        avatar: json['avatar'] as String?,
      );
}

/// A line in the bag. Price is resolved server-side at checkout, so this
/// carries only enough to render the bag and post it back.
class CartLine {
  const CartLine({
    required this.product,
    required this.quantity,
  });

  final Product product;
  final int quantity;

  CartLine copyWith({int? quantity}) =>
      CartLine(product: product, quantity: quantity ?? this.quantity);

  double get lineTotal => product.priceValue * quantity;

  Map<String, dynamic> toWire() => {
        'productId': product.id,
        'quantity': quantity,
      };
}

class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.orderId,
    required this.total,
    required this.status,
    required this.paymentStatus,
    required this.createdAt,
    required this.itemCount,
    this.trackingNumber,
  });

  final String id;
  final String orderId;
  final String total;
  final String status;
  final String paymentStatus;
  final DateTime createdAt;
  final int itemCount;
  final String? trackingNumber;

  factory OrderSummary.fromJson(Map<String, dynamic> json) {
    final items = (json['items'] as List?) ?? [];
    return OrderSummary(
      id: json['id'] as String? ?? '',
      orderId: json['orderId'] as String? ?? '',
      total: json['total'] as String? ?? '0.00',
      status: json['status'] as String? ?? 'pending',
      paymentStatus: json['paymentStatus'] as String? ?? 'pending',
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
      itemCount: items.fold<int>(
        0,
        (sum, item) =>
            sum + (((item as Map)['quantity'] as num?)?.toInt() ?? 1),
      ),
      trackingNumber: json['trackingNumber'] as String?,
    );
  }
}
