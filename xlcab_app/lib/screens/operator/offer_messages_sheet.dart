import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/operator_provider.dart';
import '../../services/api_service.dart';
import '../../services/market_service.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import 'widgets.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Messagerie d'une proposition (client ↔ opérateur). Avant la
/// confirmation, le serveur refuse téléphone, e-mail et applis de messagerie.
Future<void> showOfferMessages(BuildContext context, String offerId) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => OfferMessagesSheet(offerId: offerId),
    );

class OfferMessagesSheet extends ConsumerStatefulWidget {
  const OfferMessagesSheet({super.key, required this.offerId});

  final String offerId;

  @override
  ConsumerState<OfferMessagesSheet> createState() => _OfferMessagesSheetState();
}

class _OfferMessagesSheetState extends ConsumerState<OfferMessagesSheet> {
  final _text = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(marketServiceProvider).sendMessage(widget.offerId, body);
      _text.clear();
      ref.invalidate(offerMessagesProvider(widget.offerId));
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(offerMessagesProvider(widget.offerId));
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.md, MediaQuery.of(context).viewInsets.bottom + AppSpacing.md),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.6,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(l10n.mkMessages, style: AppTypography.h3),
          Text(l10n.mkPasDeCoordonnees, style: AppTypography.caption),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: AsyncBody(
              value: messages,
              loadingLabel: l10n.mkChargementDesMessages,
              onRetry: () => ref.invalidate(offerMessagesProvider(widget.offerId)),
              data: (list) => list.isEmpty
                  ? Center(child: Text(l10n.mkAucunMessage))
                  : ListView(children: [
                      for (final m in list)
                        Align(
                          alignment: m.mine ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: AppSpacing.xs),
                            padding: const EdgeInsets.all(AppSpacing.sm),
                            constraints: const BoxConstraints(maxWidth: 280),
                            decoration: BoxDecoration(
                              color: m.mine ? scheme.secondaryContainer : scheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
                            ),
                            child: Text(m.body, style: TextStyle(color: m.mine ? scheme.onSecondaryContainer : scheme.onSurface)),
                          ),
                        ),
                    ]),
            ),
          ),
          if (_error != null) Text(_error!, style: TextStyle(color: scheme.error)),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _text,
                maxLength: 1000,
                minLines: 1,
                maxLines: 3,
                decoration: InputDecoration(labelText: l10n.mkVotreMessage, counterText: ''),
              ),
            ),
            IconButton(tooltip: l10n.mkEnvoyer, icon: const Icon(Icons.send), onPressed: _sending ? null : _send),
          ]),
        ]),
      ),
    );
  }
}
