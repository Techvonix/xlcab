import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/primary_button.dart';
import '../widgets/xlcab_logo.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Écran 3 — Connexion / Inscription (Partie 7) par email et mot de passe.
///
/// Non affichés tant qu'ils ne fonctionnent pas : connexion Google/Apple
/// (projet Firebase à créer), OTP SMS (Twilio à brancher), mot de passe
/// oublié (SendGrid à brancher). La redirection après connexion est faite
/// par le routeur (authProvider).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

enum _Mode { login, signup }

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  _Mode _mode = _Mode.login;
  bool _obscure = true;
  bool _consent = false;
  bool _consentError = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _consentError = _mode == _Mode.signup && !_consent;
    });
    final valid = _formKey.currentState!.validate();
    if (!valid || _consentError) return;

    setState(() => _busy = true);
    final auth = ref.read(authProvider.notifier);
    try {
      if (_mode == _Mode.login) {
        await auth.login(_email.text, _password.text);
      } else {
        await auth.signup(_email.text, _password.text);
      }
    } catch (e) {
      if (mounted) setState(() => _error = authErrorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final notice = ref.watch(authProvider.select((s) => s.notice));
    final signup = _mode == _Mode.signup;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: AutofillGroup(
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Align(alignment: Alignment.centerLeft, child: XlcabLogo(size: 52, tagline: true)),
                      const SizedBox(height: AppSpacing.xl),
                      SegmentedButton<_Mode>(
                        segments: [
                          ButtonSegment(value: _Mode.login, label: Text(l10n.seConnecter)),
                          ButtonSegment(value: _Mode.signup, label: Text(l10n.creerUnCompte)),
                        ],
                        selected: {_mode},
                        // Sans coche : elle prenait la place du libellé (« Se connecter » sur 2 lignes).
                        showSelectedIcon: false,
                        onSelectionChanged: (s) => setState(() {
                          _mode = s.first;
                          _error = null;
                        }),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      if (notice != null && !signup) ...[
                        _Message(text: notice, icon: Icons.info_outline, color: AppColors.secondary),
                        const SizedBox(height: AppSpacing.md),
                      ],
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        autofillHints: const [AutofillHints.email],
                        textInputAction: TextInputAction.next,
                        decoration: InputDecoration(labelText: l10n.email, prefixIcon: const Icon(Icons.mail_outline)),
                        validator: (v) {
                          final value = (v ?? '').trim();
                          if (value.isEmpty) return l10n.emailRequis;
                          // Même exigence de forme que le serveur (IsEmail).
                          if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$').hasMatch(value)) return 'Adresse email invalide';
                          return null;
                        },
                      ),
                      const SizedBox(height: AppSpacing.md),
                      TextFormField(
                        controller: _password,
                        obscureText: _obscure,
                        autofillHints: [signup ? AutofillHints.newPassword : AutofillHints.password],
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          labelText: l10n.motDePasse,
                          helperText: signup ? l10n.n8CaracteresMinimum : null,
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
                          if (signup && value.length < 8) return l10n.leMotDePasseDoit;
                          return null;
                        },
                      ),
                      if (signup) ...[
                        const SizedBox(height: AppSpacing.sm),
                        // Partie 8 : consentement explicite à l'inscription. Non pré-coché.
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          controlAffinity: ListTileControlAffinity.leading,
                          value: _consent,
                          onChanged: (v) => setState(() {
                            _consent = v ?? false;
                            if (_consent) _consentError = false;
                          }),
                          title: Text(
                            l10n.jAccepteLesConditionsGenerales,
                          ),
                          subtitle: _consentError
                              ? Text(l10n.vousDevezAccepterLesConditions)
                              : null,
                        ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: AppSpacing.md),
                        _Message(text: _error!, icon: Icons.error_outline, color: AppColors.error),
                      ],
                      const SizedBox(height: AppSpacing.lg),
                      PrimaryButton(
                        label: _busy ? l10n.patientez : (signup ? l10n.creerMonCompte : l10n.seConnecter),
                        onPressed: _busy ? null : _submit,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text, required this.icon, required this.color});

  final String text;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          border: Border.all(color: color, width: 2),
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        ),
        child: Row(
          children: [
            ExcludeSemantics(child: Icon(icon, color: color)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: Text(text, style: AppTypography.body.copyWith(color: Theme.of(context).colorScheme.onSurface))),
          ],
        ),
      ),
    );
  }
}
