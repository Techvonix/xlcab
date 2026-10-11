import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { MESSAGES_EN } from './messages.en';
import { localizeBody, toEnglish, wantsEnglish } from './translate';

// Catalogue anglais des messages d'erreur : complet, et appliqué correctement.

const SRC = path.join(__dirname, '..');

/** Messages passés aux exceptions (new XxxException(...)) et aux validations (message: '...'). */
function errorMessagesInSource(): { text: string; where: string }[] {
  const found: { text: string; where: string }[] = [];
  const asText = (node: ts.Node | undefined): string | null => {
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('{}');
    return null;
  };
  const messageProp = (obj: ts.ObjectLiteralExpression) => {
    const prop = obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === 'message') as ts.PropertyAssignment | undefined;
    return asText(prop?.initializer);
  };
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) {
        if (f !== 'testing') walk(p);
        continue;
      }
      if (!p.endsWith('.ts') || p.endsWith('.spec.ts')) continue;
      const sf = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.ES2022, true);
      const visit = (node: ts.Node) => {
        let text: string | null = null;
        if (ts.isNewExpression(node) && /Exception$/.test(node.expression.getText())) {
          const arg = node.arguments?.[0];
          text = arg && ts.isObjectLiteralExpression(arg) ? messageProp(arg) : asText(arg);
        } else if (ts.isCallExpression(node) && /^(Is|Min|Max|Matches|Length|Array)/.test(node.expression.getText())) {
          for (const arg of node.arguments) if (ts.isObjectLiteralExpression(arg)) text = messageProp(arg) ?? text;
        }
        if (text && /[A-Za-zÀ-ÿ]/.test(text)) found.push({ text, where: `${path.relative(SRC, p)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}` });
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  };
  walk(SRC);
  return found;
}

describe('Messages du serveur en anglais', () => {
  it('chaque message d’erreur du code a sa traduction dans messages.en.ts', () => {
    const messages = errorMessagesInSource();
    expect(messages.length).toBeGreaterThan(150); // l'analyse trouve bien les messages
    const missing = messages.filter((m) => !(m.text in MESSAGES_EN)).map((m) => `${m.where} — ${m.text}`);
    expect(missing).toEqual([]);
  });

  it('les gabarits gardent autant de parties variables en anglais qu’en français', () => {
    for (const [fr, en] of Object.entries(MESSAGES_EN)) {
      expect({ fr, n: en.split('{}').length }).toEqual({ fr, n: fr.split('{}').length });
    }
  });

  it('traduction : message fixe, gabarit, parties variables connues (noms de documents, listes)', () => {
    expect(toEnglish('Email ou mot de passe incorrect')).toBe('Incorrect email or password');
    expect(toEnglish('Distance minimale : 60 km')).toBe('Minimum distance: 60 km');
    expect(toEnglish('Documents manquants : carte grise, Carte VTC')).toBe('Missing documents: vehicle registration certificate, VTC card');
    expect(toEnglish('Contrôle technique : la date d\'échéance doit être dans le futur')).toBe('Roadworthiness test: the expiry date must be in the future');
    expect(toEnglish('Plafond mensuel du collaborateur dépassé (reste 96,90 €)')).toBe('Employee monthly limit exceeded (96,90 € left)');
    // Inconnu : laissé tel quel plutôt qu'un texte vide.
    expect(toEnglish('Message pas encore traduit')).toBe('Message pas encore traduit');
  });

  it('corps d’erreur : message traduit, code métier et autres champs intacts', () => {
    expect(localizeBody({ statusCode: 403, code: 'TWO_FACTOR_REQUIRED', message: 'Double authentification requise' })).toEqual({
      statusCode: 403,
      code: 'TWO_FACTOR_REQUIRED',
      message: 'Two-factor authentication required',
    });
    expect(localizeBody({ statusCode: 400, message: ['Adresse email invalide', 'property x should not exist'] })).toEqual({
      statusCode: 400,
      message: ['Invalid email address', 'property x should not exist'],
    });
  });

  it('langue : anglais pour en / ga / de, français pour fr et en l’absence d’en-tête', () => {
    expect(wantsEnglish('en')).toBe(true);
    expect(wantsEnglish('ga')).toBe(true);
    expect(wantsEnglish('de-DE')).toBe(true);
    expect(wantsEnglish('fr')).toBe(false);
    expect(wantsEnglish('fr-BE')).toBe(false);
    expect(wantsEnglish(undefined)).toBe(false);
    expect(wantsEnglish('')).toBe(false);
  });
});
