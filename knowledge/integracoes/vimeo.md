# Integração Vimeo

> tags: vimeo, vídeo, token, pastas, embed, privacidade, hash, anti-pulo

- **Token:** em developer.vimeo.com > app > *Generate access token* (Authenticated), com os escopos `public private edit` → `VIMEO_ACCESS_TOKEN`. Para testes, a URL da API é configurável em `VIMEO_API_URL`.
- No Vimeo, **pastas = projects**: `GET /me/projects` e `GET /me/projects/{id}/videos`. A paginação vem em `paging.next`, um caminho relativo.
- **Subpastas (planeta → cursos/módulos → vídeos):** `GET /me/projects/{id}/items` devolve itens `folder` e `video`. Na API: `GET /api/master/content/vimeo/folders/{id}/tree` (desce 2 níveis).
- **Transcrição:** `GET /videos/{id}/texttracks` traz as legendas (inclusive as automáticas, `pt-x-autogen`) com um `link` temporário para o `.vtt`. Na API: `GET /api/master/content/vimeo/videos/{id}/transcript` devolve o texto corrido. É a base para escrever as práticas do que o vídeo realmente ensina. Ela é automática e pode ter erros de reconhecimento: revise os termos técnicos.
- **Quadro de vídeos do planeta:** `GET/PUT /api/master/content/planets/{id}/video-board` (`VideoBoardService`). Compara as etapas de vídeo com a pasta (`Planet.vimeoFolderUri`). O módulo de cada curso é a subpasta da maioria dos vídeos dele, e a ordem vem do número no nome. Equívocos apontados: `MISSING`, `DUPLICATE`, `WRONG_MODULE`, `ORDER`, `UNUSED`, `NOT_IN_FOLDER`. O PUT grava numa transação: `assignments`, `titles`, `unitOrder` (todas as unidades do curso) e `lessonOrder` (todas as etapas da unidade). Teste: `backend/test/e2e/organizar-videos.mjs`.
- **Vídeo não listado:** o player precisa do hash, que vem no `link` (`vimeo.com/{id}/{hash}`) ou em `player_embed_url` (`?h=`).
- **Restringir o embed aos domínios do app:** `PATCH /videos/{id} {privacy:{embed:'whitelist'}}` + `PUT /videos/{id}/privacy/domains/{domínio}` (escopo `edit`). Os domínios ficam em `VIMEO_EMBED_DOMAINS`.
- **Ligar uma pasta a um curso:** compara o nome do vídeo com o `videoTitle`/título da lição (slug, sem acento e sem caixa). Sempre rode com `dryRun` antes.
- Metadados ficam na lição: `vimeoVideoId`, `vimeoHash`, `durationSeconds`, `thumbnailUrl`, `vimeoSyncedAt`.
- **Anti-pulo:** o app envia o tempo assistido a cada 10–15s. O servidor aceita no máximo `anterior + 2 × segundos reais` (no primeiro envio, até 15s). Para concluir, é preciso assistir `minWatchPct` (90%).
- **Sem token:** a URL do vídeo é aceita e gravada só com id/hash (sem duração e miniatura); as ferramentas de pasta respondem "integração não configurada".

## Situação (2026-11-13)
- **Conectado no dev com a conta real do cliente** (conta "Folks", plano Starter). Validado pela API e pelo painel: status, 87 pastas (paginação ok), vídeos de uma pasta e um vídeo avulso com duração e miniatura. A prévia de "ligar pasta a curso" roda; não houve ligação gravada.
- **Escopos do token atual:** `public private video_files webhooks`, **sem `edit`**. A plataforma não consegue (e não tenta) mudar a privacidade dos vídeos. A restrição de embed só acontece se alguém pedir explicitamente (`restrictEmbed`, desligado por padrão).
- **Atenção (negócio):** os vídeos conferidos estão com privacidade `anybody` e embed `public`, ou seja, quem tiver o link assiste fora da plataforma, inclusive o conteúdo Premium. Restringir exige o escopo `edit` e decisão do cliente: a restrição quebra qualquer outro site onde ele já incorpore os vídeos.
- **Produção:** ainda não configurado; o token fica no `.env` da API (nunca em código ou log).
- **Limite conhecido do anti-pulo (2026-11-13):** a regra libera `anterior + 2 × segundos reais desde o último envio`. Um cliente adulterado que espera parado e depois diz "terminei" conclui sem assistir (o app e a web honestos nunca fazem isso: só contam reprodução contínua). Endurecer (ex.: exigir envios regulares durante a reprodução, ou validar pelo tempo total da sessão) é decisão pendente. Teste: `backend/test/e2e/video-progresso.mjs`.
- **Planeta Excel (2026-11-13):** criado a partir da pasta "Excel - Iniciante" (30131059), com 5 módulos = 5 cursos e 5 vídeos cada. Modelo "Vídeo e prática em cada unidade". As práticas e os desafios finais (140 questões) foram escritos a partir das transcrições automáticas, pela importação com prévia (0 erros, 0 avisos). Ficou em rascunho.
