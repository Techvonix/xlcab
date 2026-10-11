import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Horloge injectable : les tests fixent "maintenant".
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);
