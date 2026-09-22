import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/providers.dart';

/// Sign in and register share a screen — two near-identical forms behind a
/// toggle beats two routes the customer has to navigate between.
class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key, this.startOnRegister = false});

  final bool startOnRegister;

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();

  late bool _registering = widget.startOnRegister;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final auth = ref.read(authProvider.notifier);
      if (_registering) {
        await auth.register(_email.text.trim(), _password.text, _name.text.trim());
      } else {
        await auth.signIn(_email.text.trim(), _password.text);
      }
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(_registering ? 'CREATE ACCOUNT' : 'SIGN IN')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 24, top: 8),
                  child: ClipOval(
                    child: Image.asset(
                      'assets/images/logo.png',
                      width: 68,
                      height: 68,
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
              ),
              if (_registering) ...[
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Name'),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Enter your name' : null,
                ),
                const SizedBox(height: 16),
              ],
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                decoration: const InputDecoration(labelText: 'Email'),
                validator: (v) => (v == null || !v.contains('@'))
                    ? 'Enter a valid email'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
                validator: (v) => (v == null || v.length < 8)
                    ? 'At least 8 characters'
                    : null,
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.error)),
              ],
              const SizedBox(height: 28),
              SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(_registering ? 'CREATE ACCOUNT' : 'SIGN IN'),
                ),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                          _registering = !_registering;
                          _error = null;
                        }),
                child: Text(
                  _registering
                      ? 'Already have an account? Sign in'
                      : 'New here? Create an account',
                  style: theme.textTheme.bodySmall,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
