-- Seuil de départ garanti : les départs déjà confirmés avant cette version
-- n'avaient pas de seuil, ils restent garantis depuis leur confirmation.
UPDATE "LineDeparture" SET "guaranteedAt" = "confirmedAt" WHERE "confirmedAt" IS NOT NULL AND "guaranteedAt" IS NULL;
