import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/services/password_reset_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/form_message.dart';
import '../widgets/primary_button.dart';

/// Forme d'adresse acceptée, la même que l'écran de connexion et le serveur (IsEmail).
final emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$');

/// Mot de passe oublié, en deux temps sur le même écran : l'adresse, puis le code
/// reçu par e-mail avec le nouveau mot de passe. Renvoie `true` une fois le mot de
/// passe changé (l'écran de connexion l'annonce).
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});

  final String initialEmail;

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _emailForm = GlobalKey<FormState>();
  final _resetForm = GlobalKey<FormState>();
  late final _email = TextEditingController(text: widget.initialEmail.trim());
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _codeSent = false;
  bool _obscure = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    if (!_emailForm.currentState!.validate()) return;
    await _run(() async {
      await ref.read(passwordResetServiceProvider).requestCode(_email.text);
      if (mounted) setState(() => _codeSent = true);
    });
  }

  Future<void> _reset() async {
    if (!_resetForm.currentState!.validate()) return;
    await _run(() async {
      await ref.read(passwordResetServiceProvider).reset(email: _email.text, code: _code.text, password: _password.text);
      if (mounted) Navigator.of(context).pop(true);
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = authErrorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(l10n.pwTitre)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Form(
                    key: _emailForm,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Text(l10n.pwExplication, style: AppTypography.body.copyWith(color: Theme.of(context).colorScheme.onSurface)),
                      const SizedBox(height: AppSpacing.md),
                      TextFormField(
                        controller: _email,
                        enabled: !_codeSent,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        autofillHints: const [AutofillHints.email],
                        decoration: InputDecoration(labelText: l10n.email, prefixIcon: const Icon(Icons.mail_outline)),
                        validator: (v) {
                          final value = (v ?? '').trim();
                          if (value.isEmpty) return l10n.emailRequis;
                          if (!emailPattern.hasMatch(value)) return l10n.pwEmailInvalide;
                          return null;
                        },
                      ),
                    ]),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  if (!_codeSent) ...[
                    if (_error != null) ...[
                      FormMessage(text: _error!, icon: Icons.error_outline, color: Theme.of(context).colorScheme.error),
                      const SizedBox(height: AppSpacing.md),
                    ],
                    PrimaryButton(label: _busy ? l10n.patientez : l10n.pwRecevoirCode, onPressed: _busy ? null : _requestCode),
                  ] else
                    Form(
                      key: _resetForm,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        FormMessage(text: l10n.pwCodeEnvoye(_email.text.trim()), icon: Icons.mark_email_read_outlined, color: AppColors.secondary),
                        const SizedBox(height: AppSpacing.md),
                        TextFormField(
                          controller: _code,
                          keyboardType: TextInputType.number,
                          autofillHints: const [AutofillHints.oneTimeCode],
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                          decoration: InputDecoration(labelText: l10n.pwCode, prefixIcon: const Icon(Icons.pin_outlined)),
                          validator: (v) => RegExp(r'^\d{6}$').hasMatch((v ?? '').trim()) ? null : l10n.pwCodeInvalide,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        TextFormField(
                          controller: _password,
                          obscureText: _obscure,
                          autofillHints: const [AutofillHints.newPassword],
                          decoration: InputDecoration(
                            labelText: l10n.pwNouveau,
                            helperText: l10n.n8CaracteresMinimum,
                            prefixIcon: const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              tooltip: _obscure ? l10n.afficherLeMotDePasse : l10n.masquerLeMotDePasse,
                              icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                              onPressed: () => setState(() => _obscure = !_obscure),
                            ),
                          ),
                          validator: (v) {
                            final value = v ?? '';
                            if (value.isEmpty) return l10n.motDePasseRequis;
                            if (value.length < 8) return l10n.leMotDePasseDoit;
                            return null;
                          },
                        ),
                        const SizedBox(height: AppSpacing.md),
                        TextFormField(
                          controller: _confirm,
                          obscureText: _obscure,
                          autofillHints: const [AutofillHints.newPassword],
                          decoration: InputDecoration(labelText: l10n.pwConfirmer, prefixIcon: const Icon(Icons.lock_outline)),
                          validator: (v) => v == _password.text ? null : l10n.pwDifferents,
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: AppSpacing.md),
                          FormMessage(text: _error!, icon: Icons.error_outline, color: Theme.of(context).colorScheme.error),
                        ],
                        const SizedBox(height: AppSpacing.lg),
                        PrimaryButton(label: _busy ? l10n.patientez : l10n.pwChanger, onPressed: _busy ? null : _reset),
                        const SizedBox(height: AppSpacing.sm),
                        TextButton(
                          onPressed: _busy ? null : _requestCode,
                          child: Text(l10n.pwRenvoyer),
                        ),
                      ]),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
