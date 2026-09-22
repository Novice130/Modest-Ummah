import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/api_client.dart';
import '../../core/providers/providers.dart';
import '../../data/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/palette.dart';
import '../common/product_image.dart';
import '../common/surface_card.dart';

/// Checkout collects an address, then hands off to Stripe's native sheet.
///
/// It deliberately sends only product ids and quantities. The server rejects
/// any client-supplied `amount`, `shipping`, `tax` or `discount` and recomputes
/// the whole order from the database — this screen must never look like it is
/// the authority on price.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _name = TextEditingController();
  final _address1 = TextEditingController();
  final _address2 = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _zip = TextEditingController();

  bool _busy = false;
  String? _error;

  /// The form takes one name field; the order record wants two. Everything
  /// before the last space is the first name, so a single word stays the first
  /// name and the last name goes out empty rather than duplicated.
  String get _firstName {
    final parts = _name.text.trim().split(RegExp(r'\s+'));
    return parts.length > 1 ? parts.sublist(0, parts.length - 1).join(' ') : parts.first;
  }

  String get _lastName {
    final parts = _name.text.trim().split(RegExp(r'\s+'));
    return parts.length > 1 ? parts.last : '';
  }

  @override
  void initState() {
    super.initState();
    _prefill(ref.read(authProvider).user);
  }

  /// Fills the two fields the account already knows, without ever overwriting
  /// something typed. On a cold start the session is still being restored from
  /// the Keychain when this screen is built, so the same prefill runs again
  /// from a listener in build() once the user arrives.
  void _prefill(AppUser? user) {
    if (user == null) return;
    if (_email.text.isEmpty) _email.text = user.email;
    if (_name.text.isEmpty) _name.text = user.name;
  }

  @override
  void dispose() {
    for (final c in [_email, _name, _address1, _address2, _city, _state, _zip]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pay() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final lines = ref.read(cartProvider);
    if (lines.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    // Captured up front: everything after the first await may run on an
    // unmounted context.
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final messenger = ScaffoldMessenger.of(context);

    try {
      final api = ref.read(apiClientProvider);

      final intent = await api.post<Map<String, dynamic>>(
        '/checkout/payment-intent',
        data: {
          'items': lines
              .map((l) => {'productId': l.product.id, 'quantity': l.quantity})
              .toList(),
          // Field names are the server's, not ours: `customerEmail` and a
          // ShippingAddressDB-shaped address. Shipping and tax are recomputed
          // from `postalCode` and `state`, so an address in any other shape
          // resolves to a wrong total or fails outright.
          'customerEmail': _email.text.trim(),
          'shippingAddress': {
            'firstName': _firstName,
            'lastName': _lastName,
            'address1': _address1.text.trim(),
            'address2': _address2.text.trim(),
            'city': _city.text.trim(),
            'state': _state.text.trim().toUpperCase(),
            'postalCode': _zip.text.trim(),
            'country': 'US',
            'email': _email.text.trim(),
          },
        },
      );

      final clientSecret = intent['clientSecret'] as String?;
      if (clientSecret == null) {
        throw ApiException('Checkout could not be started. Please try again.');
      }

      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: 'Modest Ummah',
          style: isDark ? ThemeMode.dark : ThemeMode.light,
        ),
      );

      await Stripe.instance.presentPaymentSheet();

      // The Stripe webhook is the source of truth for order state — it writes
      // the order, decrements stock and sends the confirmation email. The app
      // never creates the order itself.
      if (!mounted) return;
      ref.read(cartProvider.notifier).clear();
      context.go('/orders');
      messenger.showSnackBar(
        const SnackBar(content: Text('Thank you — your order is confirmed.')),
      );
    } on StripeException catch (e) {
      if (mounted) {
        setState(() => _error = e.error.localizedMessage ?? 'Payment was not completed.');
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authProvider, (_, next) => _prefill(next.user));

    final theme = Theme.of(context);
    final lines = ref.watch(cartProvider);
    final subtotal = ref.watch(cartSubtotalProvider);

    return Scaffold(
      backgroundColor: pageBackdrop(context),
      appBar: AppBar(
        title: const Text('CHECKOUT'),
        backgroundColor: pageBackdrop(context),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.only(top: 4, bottom: 24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // What is being bought, before what it costs to ship it: the
              // order recap is the first thing a shopper checks here.
              SurfaceCard(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('ORDER', style: AppText.overline.copyWith(
                      color: theme.textTheme.bodySmall?.color,
                    )),
                    const SizedBox(height: 12),
                    for (final line in lines)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _OrderLine(line: line),
                      ),
                    Divider(
                      height: 20,
                      color: theme.brightness == Brightness.dark
                          ? Brand.hairlineDark
                          : Brand.hairline,
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Subtotal', style: theme.textTheme.bodyMedium),
                        Text(
                          '\$${subtotal.toStringAsFixed(2)}',
                          style: AppText.price.copyWith(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Shipping and tax are calculated on the next step.',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),

              SurfaceCard(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('SHIPPING TO', style: AppText.overline.copyWith(
                      color: theme.textTheme.bodySmall?.color,
                    )),
                    const SizedBox(height: 14),
                    _field(_name, 'Full name'),
                    _field(_email, 'Email', keyboard: TextInputType.emailAddress),
                    _field(_address1, 'Address'),
                    _field(_address2, 'Apartment, suite (optional)', required: false),
                    _field(_city, 'City'),
                    Row(
                      children: [
                        Expanded(child: _field(_state, 'State', maxLength: 2)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _field(_zip, 'ZIP', keyboard: TextInputType.number),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              if (_error != null)
                SurfaceCard(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.error_outline,
                          size: 18, color: theme.colorScheme.error),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _error!,
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: theme.colorScheme.error),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: Container(
        color: pageBackdrop(context),
        child: SafeArea(
          top: false,
          child: SurfaceCard(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.lock_outline,
                        size: 14, color: theme.textTheme.bodySmall?.color),
                    const SizedBox(width: 6),
                    Text(
                      'Payment handled by Stripe',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 50,
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _busy ? null : _pay,
                    style: FilledButton.styleFrom(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    child: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Continue to payment'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    TextInputType? keyboard,
    bool required = true,
    int? maxLength,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        keyboardType: keyboard,
        maxLength: maxLength,
        textCapitalization: TextCapitalization.words,
        decoration: InputDecoration(
          labelText: label,
          counterText: '',
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Theme.of(context).colorScheme.onSurface),
          ),
          fillColor: Theme.of(context).scaffoldBackgroundColor,
        ),
        validator: (v) => required && (v == null || v.trim().isEmpty)
            ? 'Required'
            : null,
      ),
    );
  }
}

/// A recap row: thumbnail, name, quantity, line total.
class _OrderLine extends StatelessWidget {
  const _OrderLine({required this.line});
  final CartLine line;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.color;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            width: 44,
            height: 55,
            child: ProductImage(image: line.product.primaryImage),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                line.product.name,
                style: theme.textTheme.titleMedium?.copyWith(fontSize: 14),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text('Qty ${line.quantity}',
                  style: AppText.bodySmall.copyWith(color: muted)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '\$${line.lineTotal.toStringAsFixed(2)}',
          style: AppText.price.copyWith(fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}
