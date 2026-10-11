import 'package:flutter/material.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'app_colors.dart';

/// Couleur d'identité d'une navette (repère de catégorie de service).
extension ShuttleTypeColor on ShuttleType {
  Color get color => AppColors.forShuttleType(apiValue);
}
