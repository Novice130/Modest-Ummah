import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/api_client.dart';
import '../../core/providers/providers.dart';
import '../../core/theme/app_theme.dart';

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

  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).user;
    if (user != null) {
      _email.text = user.email;
      _name.text = user.name;
    }
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
          'email': _email.text.trim(),
          'shippingAddress': {
            'name': _name.text.trim(),
            'address1': _address1.text.trim(),
            'address2': _address2.text.trim(),
            'city': _city.text.trim(),
            'state': _state.text.trim().toUpperCase(),
            'zip': _zip.text.trim(),
            'country': 'US',
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
    final theme = Theme.of(context);
    final subtotal = ref.watch(cartSubtotalProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('CHECKOUT')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('SHIPPING TO', style: AppText.overline),
              const SizedBox(height: 16),
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
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('SUBTOTAL', style: AppText.overline),
                  Text('\$${subtotal.toStringAsFixed(2)}',
                      style: AppText.price.copyWith(fontSize: 16)),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Shipping and tax are calculated on the next step.',
                style: theme.textTheme.bodySmall,
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.error)),
              ],
              const SizedBox(height: 24),
              SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: _busy ? null : _pay,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('CONTINUE TO PAYMENT'),
                ),
              ),
            ],
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
        decoration: InputDecoration(labelText: label, counterText: ''),
        validator: (v) => required && (v == null || v.trim().isEmpty)
            ? 'Required'
            : null,
      ),
    );
  }
}
