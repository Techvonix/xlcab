import 'dart:typed_data';

import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Partie 9 : "Upload avec compression 2MB max". Marge sous la limite
/// serveur (2 Mo) pour l'enveloppe multipart.
const int maxDocumentBytes = 2 * 1024 * 1024;
const int _targetBytes = maxDocumentBytes - 64 * 1024;

enum DocumentSource { camera, gallery }

class PickedDocument {
  const PickedDocument({required this.bytes, required this.filename});

  final Uint8List bytes;
  final String filename;
}

typedef ImageCompressor = Future<Uint8List> Function(Uint8List bytes, {required int quality, required int maxSide});

/// Compresse jusqu'à passer sous la limite : qualité JPEG décroissante,
/// puis réduction de la taille si nécessaire. Un document reste lisible à
/// 1 600 px de côté. Lève ApiException si c'est impossible.
Future<Uint8List> compressUnderLimit(Uint8List original, ImageCompressor compress) async {
  const attempts = [
    (quality: 85, maxSide: 2000),
    (quality: 75, maxSide: 1600),
    (quality: 60, maxSide: 1600),
    (quality: 50, maxSide: 1280),
  ];
  for (final a in attempts) {
    final out = await compress(original, quality: a.quality, maxSide: a.maxSide);
    if (out.lengthInBytes <= _targetBytes) return out;
  }
  throw ApiException(l10n.photoTropLourdeMemeApres);
}

/// Choix d'une photo de document. Interface pour les tests.
abstract class DocumentPicker {
  /// null si l'utilisateur annule.
  Future<PickedDocument?> pick(DocumentSource source);
}

class ImagePickerDocumentPicker implements DocumentPicker {
  final _picker = ImagePicker();

  @override
  Future<PickedDocument?> pick(DocumentSource source) async {
    final file = await _picker.pickImage(
      source: source == DocumentSource.camera ? ImageSource.camera : ImageSource.gallery,
      // Pas de métadonnées étendues (lieu, date) : inutiles ici.
      requestFullMetadata: false,
    );
    if (file == null) return null;
    final bytes = await compressUnderLimit(await file.readAsBytes(), _compressJpeg);
    return PickedDocument(bytes: bytes, filename: 'document.jpg');
  }

  // Ré-encodage JPEG natif. keepExif: false retire notamment la position
  // GPS incrustée dans les photos (minimisation RGPD).
  static Future<Uint8List> _compressJpeg(Uint8List bytes, {required int quality, required int maxSide}) {
    return FlutterImageCompress.compressWithList(
      bytes,
      minWidth: maxSide,
      minHeight: maxSide,
      quality: quality,
      format: CompressFormat.jpeg,
      keepExif: false,
    );
  }
}

final documentPickerProvider = Provider<DocumentPicker>((ref) => ImagePickerDocumentPicker());
