# ADR 0008 — Vídeos interativos: LRS xAPI embutido + SCORM

> tags: adr, scorm, xapi, cmi5, lrs, interativo, vídeo interativo | status: aceita | data: 2026-11-09

## Decisão
- O MASTER envia o .zip; a API detecta `cmi5.xml`, `tincan.xml` ou `imsmanifest.xml` (SCORM 1.2/2004) e extrai com proteção contra zip-slip.
- **xAPI/cmi5 (recomendado):** o conteúdo envia statements para o **LRS embutido** (`/api/xapi/*`), autenticado por um token de launch de 6h.
- **SCORM:** o front usa `scorm-again` e faz commit em `/api/interactive/scorm/commit`.
- Conclusão ou aprovação viram `LessonProgress` + XP, pelo mesmo fluxo das outras etapas.

## Pendência
Hoje os arquivos são servidos publicamente por UUID; em produção, usar storage S3/R2 com URL assinada.
