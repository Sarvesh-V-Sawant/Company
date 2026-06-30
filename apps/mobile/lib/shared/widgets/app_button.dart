import 'package:flutter/material.dart';

enum AppButtonVariant { primary, destructive, outline, ghost, amber }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.fullWidth = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final AppButtonVariant variant;
  final IconData? icon;
  final bool fullWidth;

  Widget _child() => loading
      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
      : Row(
          mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
            Text(label),
          ],
        );

  @override
  Widget build(BuildContext context) {
    final effectiveOnPressed = loading ? null : onPressed;
    return switch (variant) {
      AppButtonVariant.primary => ElevatedButton(onPressed: effectiveOnPressed, child: _child()),
      AppButtonVariant.destructive => ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: Theme.of(context).colorScheme.error,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(48),
          ),
          onPressed: effectiveOnPressed,
          child: _child(),
        ),
      AppButtonVariant.amber => ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFFD97706),
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(48),
          ),
          onPressed: effectiveOnPressed,
          child: _child(),
        ),
      AppButtonVariant.outline => OutlinedButton(onPressed: effectiveOnPressed, child: _child()),
      AppButtonVariant.ghost => TextButton(onPressed: effectiveOnPressed, child: _child()),
    };
  }
}
