import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/config/legal.dart';
import 'package:xlcab_core/models/account.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/providers/theme_provider.dart';
import 'package:xlcab_core/providers/locale_provider.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/account_service.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_ui/widgets/legal_links.dart';
import 'package:xlcab_ui/theme/app_colors.dart';

export 'package:xlcab_ui/widgets/legal_links.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/l10n/l10n.dart';

final profileProvider = FutureProvider.autoDispose<UserProfile>((ref) => ref.watch(accountServiceProvider).me());

/// Écran 13 — Profil (Partie 7) : identité, historique, moyens de
/// paiement, préférences, liens légaux, version, déconnexion et
/// suppression du compte (RGPD).
/// (Photo de profil et adresses favorites : pas encore de stockage côté serveur.)
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  static Map<UserRole, String> get _roleLabels => {
    UserRole.passenger: l10n.passager3,
    UserRole.driver: l10n.chauffeur2,
    UserRole.corporateAdmin: l10n.administrateurEntreprise,
    UserRole.corporateMember: l10n.collaborateurEntreprise,
    UserRole.admin: l10n.equipeXlcab,
  };

  // Les comptes entreprise et équipe se clôturent avec le support (serveur).
  static const _selfDeletable = {UserRole.passenger, UserRole.driver, UserRole.corporateMember};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final profile = ref.watch(profileProvider);
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.7);

    Widget section(String title) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.xs),
          child: Semantics(header: true, child: Text(title, style: AppTypography.caption.copyWith(color: muted))),
        );

    Widget tile(IconData icon, String title, VoidCallback onTap, {String? subtitle}) => ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(icon),
          title: Text(title),
          subtitle: subtitle == null ? null : Text(subtitle),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        );

    return Scaffold(
      appBar: AppBar(title: Text(l10n.monCompte)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          profile.when(
            loading: () => SizedBox(height: 72, child: Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDuProfil))),
            error: (e, _) => Row(children: [
              Expanded(child: Text(e is ApiException ? e.message : l10n.profilIndisponible)),
              TextButton(onPressed: () => ref.invalidate(profileProvider), child: Text(l10n.reessayer)),
            ]),
            data: (p) => _Header(profile: p, roleLabel: _roleLabels[auth.role] ?? '—'),
          ),
          if (auth.role == UserRole.driver)
            tile(Icons.local_taxi_outlined, l10n.modeChauffeur, () => context.go(AppRoutes.driverMode)),
          if (auth.role == UserRole.passenger)
            tile(Icons.badge_outlined, l10n.devenirChauffeurXlcab, () => context.push(AppRoutes.driverOnboarding)),
          section(l10n.mesTrajetsEtPaiements),
          tile(Icons.history, l10n.historiqueDesTrajets, () => context.push(AppRoutes.tripHistory)),
          tile(Icons.credit_card, l10n.moyensDePaiement, () => context.push(AppRoutes.paymentMethods)),
          tile(Icons.star_outline_rounded, l10n.adressesFavorites, () => context.push(AppRoutes.savedAddresses)),
          section(l10n.preferences),
          tile(Icons.notifications_none, l10n.notifications, () => context.push(AppRoutes.notificationPreferences)),
          const _ThemeSelector(),
          const SizedBox(height: AppSpacing.md),
          const _LanguageSelector(),
          section(l10n.informationsLegales),
          tile(Icons.privacy_tip_outlined, l10n.politiqueDeConfidentialite, () => _open(context, ref, privacyPolicyFor(Localizations.localeOf(context).languageCode))),
          tile(Icons.description_outlined, l10n.conditionsGeneralesCguCgv, () => _open(context, ref, termsFor(Localizations.localeOf(context).languageCode))),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.mail_outline),
            title: Text(l10n.protectionDesDonnees),
            subtitle: const Text(dpoEmail),
            onTap: () => _open(context, ref, 'mailto:$dpoEmail'),
          ),
          const SizedBox(height: AppSpacing.lg),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSpacing.buttonHeight)),
            icon: const Icon(Icons.logout),
            label: Text(l10n.seDeconnecter),
            onPressed: () => ref.read(authProvider.notifier).signOut(),
          ),
          if (_selfDeletable.contains(auth.role)) ...[
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              style: TextButton.styleFrom(foregroundColor: Theme.of(context).brightness == Brightness.dark ? const Color(0xFFFF8A80) : const Color(0xFFC62828)),
              onPressed: () => _confirmDeletion(context, ref),
              child: Text(l10n.supprimerMonCompte),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          Text(l10n.xlcabVersion(appVersion), textAlign: TextAlign.center, style: AppTypography.caption.copyWith(color: muted)),
        ],
      ),
    );
  }

  Future<void> _open(BuildContext context, WidgetRef ref, String url) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await ref.read(legalLinkOpenerProvider)(Uri.parse(url));
    if (!ok) messenger.showSnackBar(SnackBar(content: Text(l10n.impossibleDOuvrirLeLien)));
  }

  Future<void> _confirmDeletion(BuildContext context, WidgetRef ref) async {
    final password = await showDialog<String>(context: context, builder: (_) => const _DeleteAccountDialog());
    if (password == null || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(accountServiceProvider).deleteAccount(password);
      await ref.read(authProvider.notifier).accountDeleted();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message), duration: const Duration(seconds: 6)));
    }
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.profile, required this.roleLabel});

  final UserProfile profile;
  final String roleLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        ExcludeSemantics(
          child: CircleAvatar(
            radius: 28,
            backgroundColor: AppColors.selectionLight,
            foregroundColor: AppColors.onSelectionLight,
            child: Text(profile.initials, style: AppTypography.h3),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(profile.displayName, style: AppTypography.h3.copyWith(color: scheme.onSurface)),
              Text(profile.email, style: AppTypography.body.copyWith(color: scheme.onSurface.withValues(alpha: 0.75))),
              Text(roleLabel, style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.75))),
            ],
          ),
        ),
        IconButton(
          tooltip: l10n.modifierMonNom,
          icon: const Icon(Icons.edit_outlined),
          onPressed: () => _edit(context, ref),
        ),
      ],
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (_) => _NameDialog(firstName: profile.firstName ?? '', lastName: profile.lastName ?? ''),
    );
    if (result == null || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(accountServiceProvider).updateName(firstName: result.$1, lastName: result.$2);
      ref.invalidate(profileProvider);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _NameDialog extends StatefulWidget {
  const _NameDialog({required this.firstName, required this.lastName});

  final String firstName;
  final String lastName;

  @override
  State<_NameDialog> createState() => _NameDialogState();
}

class _NameDialogState extends State<_NameDialog> {
  late final _first = TextEditingController(text: widget.firstName);
  late final _last = TextEditingController(text: widget.lastName);
  final _form = GlobalKey<FormState>();

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    super.dispose();
  }

  String? _required(String? v) => (v ?? '').trim().isEmpty ? l10n.champObligatoire : null;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(l10n.monNom),
      content: Form(
        key: _form,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextFormField(controller: _first, decoration: InputDecoration(labelText: l10n.prenom), maxLength: 60, validator: _required),
          TextFormField(controller: _last, decoration: InputDecoration(labelText: l10n.nom), maxLength: 60, validator: _required),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.annuler)),
        FilledButton(
          onPressed: () {
            if (_form.currentState!.validate()) Navigator.of(context).pop((_first.text.trim(), _last.text.trim()));
          },
          child: Text(l10n.enregistrer),
        ),
      ],
    );
  }
}

/// Confirmation de suppression : conséquences expliquées, mot de passe redemandé.
class _DeleteAccountDialog extends StatefulWidget {
  const _DeleteAccountDialog();

  @override
  State<_DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<_DeleteAccountDialog> {
  final _password = TextEditingController();

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(l10n.supprimerVotreCompte),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            l10n.cetteActionEstDefinitiveVos +
            l10n.lHistoriqueDeVosCourses,
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _password,
            obscureText: true,
            autofillHints: const [AutofillHints.password],
            decoration: InputDecoration(labelText: l10n.motDePasse),
            onChanged: (_) => setState(() {}),
          ),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.garderMonCompte)),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: const Color(0xFFC62828), foregroundColor: Colors.white),
          onPressed: _password.text.isEmpty ? null : () => Navigator.of(context).pop(_password.text),
          child: Text(l10n.supprimer),
        ),
      ],
    );
  }
}

/// Langue de l'interface : celle du téléphone par défaut. Le choix est aussi
/// enregistré sur le compte (langue des futurs e-mails et notifications).
class _LanguageSelector extends ConsumerWidget {
  const _LanguageSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final code = ref.watch(localeProvider)?.languageCode ?? 'system';
    return _ChoiceGroup<String>(
      title: l10n.langue,
      selected: code,
      options: [
        ('system', l10n.langueDuTelephone, Icons.smartphone),
        // Chaque langue est écrite dans sa propre langue.
        ('fr', 'Français', null),
        ('en', 'English', null),
      ],
      onSelected: (choice) {
        ref.read(localeProvider.notifier).state = choice == 'system' ? null : Locale(choice);
        final effective = choice == 'system' ? resolveAppLocale(WidgetsBinding.instance.platformDispatcher.locale).languageCode : choice;
        // Sans réseau, le choix reste valable sur l'appareil.
        ref.read(accountServiceProvider).updateLocale(effective).catchError((_) {});
      },
    );
  }
}

class _ThemeSelector extends ConsumerWidget {
  const _ThemeSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    return _ChoiceGroup<ThemeMode>(
      title: l10n.apparence,
      selected: mode,
      options: [
        (ThemeMode.system, l10n.systeme, Icons.brightness_auto),
        (ThemeMode.light, l10n.clair, Icons.light_mode_outlined),
        (ThemeMode.dark, l10n.sombre, Icons.dark_mode_outlined),
      ],
      onSelected: (m) => ref.read(themeModeProvider.notifier).state = m,
    );
  }
}

/// Choix exclusif en pastilles : passent à la ligne sur un petit écran ou avec
/// un texte agrandi (Partie 5 : jusqu'à 200 %), au lieu de couper les mots
/// comme un SegmentedButton.
class _ChoiceGroup<T> extends StatelessWidget {
  const _ChoiceGroup({required this.title, required this.selected, required this.options, required this.onSelected});

  final String title;
  final T selected;
  final List<(T, String, IconData?)> options;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: AppTypography.bodyBold.copyWith(color: onSurface)),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            for (final (value, label, icon) in options)
              ChoiceChip(
                avatar: icon == null ? null : Icon(icon, size: 18),
                label: Text(label),
                selected: value == selected,
                onSelected: (_) => onSelected(value),
              ),
          ],
        ),
      ],
    );
  }
}
