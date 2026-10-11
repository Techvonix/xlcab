import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import '../models/account.dart';
import '../models/payment.dart';
import '../models/quote.dart';
import 'api_service.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Clé PUBLIABLE Stripe (pk_test_… / pk_live_…), fournie à la compilation :
///   --dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_...
/// Jamais la clé secrète, qui reste sur le serveur.
const String stripePublishableKey = String.fromEnvironment('STRIPE_PUBLISHABLE_KEY');

/// Identifiant marchand Apple Pay (iOS), ex. merchant.com.xlcab.
const String appleMerchantId = String.fromEnvironment('APPLE_MERCHANT_ID', defaultValue: 'merchant.com.xlcab');

/// À appeler au démarrage. Sans clé, le paiement est indisponible
/// (message clair à l'écran 7) au lieu d'un plantage.
Future<void> initStripe() async {
  if (stripePublishableKey.isEmpty) return;
  Stripe.publishableKey = stripePublishableKey;
  Stripe.merchantIdentifier = appleMerchantId;
  await Stripe.instance.applySettings();
}

class PaymentService {
  PaymentService(this._dio);

  final Dio _dio;

  /// POST /bookings/passenger : crée la course (prix recalculé par le
  /// serveur) et renvoie la feuille de paiement.
  Future<PaymentSheetParams> createBooking(PassengerQuoteRequest request) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/v1/bookings/passenger', data: request.toBookingJson());
      return PaymentSheetParams.fromJson(res.data?['payment']);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }

  /// Reprise du paiement d'une course déjà créée (nouvelle tentative).
  Future<PaymentSheetParams> resume(String tripId) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/v1/payments/intent', data: {'tripId': tripId});
      return PaymentSheetParams.fromJson(res.data);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }

  /// Confirmation après la feuille Stripe (le webhook peut avoir du retard).
  Future<String> confirm(String tripId) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/v1/payments/confirm', data: {'tripId': tripId});
      return res.data?['paymentStatus'] as String? ?? 'unknown';
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final paymentServiceProvider = Provider<PaymentService>((ref) => PaymentService(ref.watch(dioProvider)));

/// Affichage de la feuille de paiement. Interface : la feuille Stripe est
/// une vue native, remplacée dans les tests.
abstract class PaymentSheetPresenter {
  bool get isAvailable;
  Future<PaymentSheetResult> present(PaymentSheetParams params);

  /// Enregistrement d'une carte sans paiement (écran 13, SetupIntent).
  Future<PaymentSheetResult> presentSetup(SetupSheetParams params);
}

class StripePaymentSheetPresenter implements PaymentSheetPresenter {
  @override
  bool get isAvailable => stripePublishableKey.isNotEmpty;

  @override
  Future<PaymentSheetResult> present(PaymentSheetParams params) async {
    try {
      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          merchantDisplayName: 'XLCAB',
          paymentIntentClientSecret: params.paymentIntentClientSecret,
          customerId: params.customerId,
          customerEphemeralKeySecret: params.ephemeralKeySecret,
          // Partie 7 (écran 7) : Apple Pay et Google Pay.
          applePay: const PaymentSheetApplePay(merchantCountryCode: 'FR'),
          googlePay: const PaymentSheetGooglePay(merchantCountryCode: 'FR', currencyCode: 'EUR', testEnv: !kReleaseMode),
          style: ThemeMode.system,
        ),
      );
      await Stripe.instance.presentPaymentSheet();
      return const PaymentSheetResult(PaymentSheetOutcome.completed);
    } on StripeException catch (e) {
      if (e.error.code == FailureCode.Canceled) return const PaymentSheetResult(PaymentSheetOutcome.canceled);
      return PaymentSheetResult(PaymentSheetOutcome.failed, e.error.localizedMessage ?? l10n.paiementRefuse);
    }
  }

  @override
  Future<PaymentSheetResult> presentSetup(SetupSheetParams params) => _show(
        () => Stripe.instance.initPaymentSheet(
          paymentSheetParameters: SetupPaymentSheetParameters(
            merchantDisplayName: 'XLCAB',
            setupIntentClientSecret: params.setupIntentClientSecret,
            customerId: params.customerId,
            customerEphemeralKeySecret: params.ephemeralKeySecret,
            style: ThemeMode.system,
          ),
        ),
      );
}

extension on StripePaymentSheetPresenter {
  Future<PaymentSheetResult> _show(Future<void> Function() init) async {
    try {
      await init();
      await Stripe.instance.presentPaymentSheet();
      return const PaymentSheetResult(PaymentSheetOutcome.completed);
    } on StripeException catch (e) {
      if (e.error.code == FailureCode.Canceled) return const PaymentSheetResult(PaymentSheetOutcome.canceled);
      return PaymentSheetResult(PaymentSheetOutcome.failed, e.error.localizedMessage ?? l10n.carteRefusee);
    }
  }
}

final paymentSheetPresenterProvider = Provider<PaymentSheetPresenter>((ref) => StripePaymentSheetPresenter());
