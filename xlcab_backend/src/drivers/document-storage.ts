import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * Stockage des documents chauffeurs. Interface abstraite : disque local
 * en développement, S3 privé (eu-west-3, URLs signées 15 min, Partie 8)
 * en production — à brancher avec les accès AWS.
 */
export abstract class DocumentStorage {
  abstract put(key: string, data: Buffer, mimeType: string): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
}

/**
 * Disque local, hors de tout dossier servi par l'API. Les clés sont
 * générées par le serveur (UUID) : aucun nom de fichier client n'entre
 * dans un chemin, donc pas de traversée de répertoire possible.
 */
/** Clé opaque « uuid.ext » : jamais de nom lisible ni de séparateur de chemin. */
export function assertStorageKey(key: string): void {
  if (!/^[0-9a-f-]{36}\.(jpg|png|pdf)$/.test(key)) throw new Error('Clé de stockage invalide');
}

@Injectable()
export class LocalDiskStorage extends DocumentStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = resolve(config.get<string>('UPLOAD_DIR') ?? 'storage/private');
  }

  async put(key: string, data: Buffer): Promise<void> {
    await mkdir(this.root, { recursive: true });
    // 0o600 : lisible par le seul compte du serveur.
    await writeFile(this.path(key), data, { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined);
  }

  private path(key: string): string {
    assertStorageKey(key);
    return join(this.root, key);
  }
}

/** Types de fichiers acceptés, détectés d'après leur contenu. */
export type DetectedType = { mime: 'image/jpeg' | 'image/png' | 'application/pdf'; ext: 'jpg' | 'png' | 'pdf' };

/**
 * Identifie le fichier par sa signature binaire ("magic bytes"), jamais
 * par son nom ni par le type annoncé par le client, qui peuvent mentir.
 */
export function detectFileType(data: Buffer): DetectedType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (data.length >= 5 && data.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  return null;
}

/**
 * Stockage en mémoire, utilisé automatiquement pendant les tests (Jest
 * fixe NODE_ENV=test) : aucun fichier n'est écrit sur le disque.
 */
export class MemoryDocumentStorage extends DocumentStorage {
  private files = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<void> {
    // Même contrôle que sur disque : un format de clé refusé en vrai l'est aussi dans les tests.
    assertStorageKey(key);
    this.files.set(key, data);
  }

  async get(key: string): Promise<Buffer> {
    const f = this.files.get(key);
    if (!f) throw new Error('Fichier introuvable');
    return f;
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }
}
