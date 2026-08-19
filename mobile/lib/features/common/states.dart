import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Shared empty / error states, so every screen fails the same way.
class MessageState extends StatelessWidget {
  const MessageState({
    super.key,
    required this.title,
    this.body,
    this.actionLabel,
    this.onAction,
    this.icon,
  });

  final String title;
  final String? body;
  final String? actionLabel;
  final VoidCallback? onAction;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 28, color: theme.textTheme.bodySmall?.color),
              const SizedBox(height: 16),
            ],
            Text(title, style: theme.textTheme.headlineMedium, textAlign: TextAlign.center),
            if (body != null) ...[
              const SizedBox(height: 10),
              Text(body!, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 24),
              SizedBox(
                width: 200,
                child: OutlinedButton(onPressed: onAction, child: Text(actionLabel!)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Section eyebrow used above product rows.
class SectionHeading extends StatelessWidget {
  const SectionHeading(this.label, {super.key, this.action, this.onAction});

  final String label;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: theme.textTheme.headlineMedium),
        if (action != null)
          GestureDetector(
            onTap: onAction,
            child: Text(
              action!.toUpperCase(),
              style: AppText.overline.copyWith(color: theme.textTheme.bodySmall?.color),
            ),
          ),
      ],
    );
  }
}
