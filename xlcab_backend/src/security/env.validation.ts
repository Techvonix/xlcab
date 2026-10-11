// Vérification de la configuration au démarrage (Partie 8 : « Clés API dans
// AWS Secrets Manager », secrets robustes). En production, un secret absent,
// trop court ou resté à sa valeur d'exemple empêche le démarrage : mieux vaut
// une API arrêtée qu'une API qui signe des jetons avec « change_me ».
// Hors production, seuls des avertissements sont émis.

const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER = /change_me|changeme|secret|password|example/i;

export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const production = env.NODE_ENV === 'production';
  const problems: string[] = [];
  const str = (k: string) => (typeof env[k] === 'string' ? (env[k] as string) : '');

  for (const k of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = str(k);
    if (v.length < MIN_SECRET_LENGTH) problems.push(`${k} : au moins ${MIN_SECRET_LENGTH} caractères aléatoires`);
    else if (PLACEHOLDER.test(v)) problems.push(`${k} : valeur d'exemple, à remplacer`);
  }
  if (str('JWT_SECRET') && str('JWT_SECRET') === str('JWT_REFRESH_SECRET')) {
    problems.push('JWT_SECRET et JWT_REFRESH_SECRET doivent être différents');
  }
  if (!str('DATABASE_URL')) problems.push('DATABASE_URL manquant');

  if (production) {
    const key = str('TWO_FACTOR_ENC_KEY');
    if (Buffer.from(key, 'base64').length !== 32) problems.push('TWO_FACTOR_ENC_KEY : 32 octets en base64 (openssl rand -base64 32)');
    if (!str('CORS_ORIGINS')) problems.push('CORS_ORIGINS : liste blanche des portails web (https://…)');
    else if (str('CORS_ORIGINS').split(',').some((o) => !o.trim().startsWith('https://'))) {
      problems.push('CORS_ORIGINS : origines en https uniquement');
    }
    if (!str('PUBLIC_API_URL').startsWith('https://')) problems.push('PUBLIC_API_URL : adresse publique https de l’API');
    if (!str('REDIS_PASSWORD')) problems.push('REDIS_PASSWORD : Redis doit être protégé par mot de passe');
    if (str('STRIPE_SECRET_KEY') && !str('STRIPE_WEBHOOK_SECRET')) {
      problems.push('STRIPE_WEBHOOK_SECRET manquant alors que Stripe est configuré');
    }
  }

  if (problems.length > 0) {
    const message = `Configuration non sûre :\n - ${problems.join('\n - ')}`;
    if (production) throw new Error(message);
    // eslint-disable-next-line no-console
    console.warn(`[XLCAB] ${message}\n(avertissement hors production)`);
  }
  return env;
}
