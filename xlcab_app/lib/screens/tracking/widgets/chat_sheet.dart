import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../providers/auth_provider.dart';
import '../../../providers/tracking_provider.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_typography.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Ouvre le chat avec le chauffeur (bouton "Message", Partie 7 écran 9).
Future<void> showChatSheet(BuildContext context, String tripId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => ChatSheet(tripId: tripId),
  );
}

class ChatSheet extends ConsumerStatefulWidget {
  const ChatSheet({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<ChatSheet> createState() => _ChatSheetState();
}

class _ChatSheetState extends ConsumerState<ChatSheet> {
  final _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _send() {
    ref.read(trackingControllerProvider(widget.tripId).notifier).sendMessage(_input.text);
    _input.clear();
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(trackingControllerProvider(widget.tripId).select((s) => s.messages));
    final myId = ref.watch(authProvider).userId;
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;

    return Padding(
      // Le champ reste au-dessus du clavier.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.6,
        child: Column(
          children: [
            Semantics(
              header: true,
              child: Text(l10n.messages, style: AppTypography.h3.copyWith(color: scheme.onSurface)),
            ),
            Expanded(
              child: messages.isEmpty
                  ? Center(
                      child: Text(
                        l10n.aucunMessagePourLInstant,
                        style: AppTypography.body.copyWith(color: scheme.onSurface.withValues(alpha: 0.7)),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      itemCount: messages.length,
                      itemBuilder: (context, i) {
                        final m = messages[i];
                        final mine = m.fromId == myId;
                        final time = DateFormat.Hm(locale).format(m.at);
                        return Align(
                          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                          child: Semantics(
                            label: '${mine ? 'Vous' : 'Chauffeur'}, $time : ${m.text}',
                            excludeSemantics: true,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                              padding: const EdgeInsets.all(AppSpacing.sm + 4),
                              constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.75),
                              decoration: BoxDecoration(
                                color: mine
                                    ? AppColors.secondary.withValues(alpha: 0.15)
                                    : scheme.onSurface.withValues(alpha: 0.06),
                                borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Texte brut : jamais interprété comme HTML/markdown.
                                  Text(m.text, style: AppTypography.body.copyWith(color: scheme.onSurface)),
                                  Text(
                                    '${mine ? 'Vous' : 'Chauffeur'} · $time',
                                    style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.7)),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _input,
                        maxLength: 500, // limite du serveur (Module 3)
                        minLines: 1,
                        maxLines: 4,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _send(),
                        decoration: InputDecoration(hintText: l10n.votreMessage, counterText: ''),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    IconButton.filled(
                      tooltip: l10n.envoyer,
                      icon: const Icon(Icons.send),
                      onPressed: _send,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
