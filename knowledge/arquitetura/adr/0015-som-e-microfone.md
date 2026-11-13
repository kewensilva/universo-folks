# ADR 0015 — Cursos de som: aula de som, treino de ouvido e microfone

> tags: adr, som, áudio, música, violão, canto, voz, microfone, afinação, afinador, grave, agudo, notas, acordes, treino de ouvido, prática gerada, mic_pitch, audioDemos, listen_choose, play_or_sing_note, expo-audio, tts | status: aceita | data: 2026-11-13

## Contexto
Os cursos "Para a vida" de violão (e, no futuro, canto e fotografia) precisam de **som em vez de vídeo**:
- o aluno ouve notas, acordes e tons (grave e agudo);
- pratica de ouvido;
- e usa o **microfone** para tocar ou cantar a nota certa.

O protótipo já sintetizava a corda do violão (Karplus-Strong) e gerava as práticas "grave ou agudo", "maior ou menor", graus e progressões. Mas o app novo não tocava som nem rodava práticas geradas, e a importação descartava os sons das telas.

## Decisão
- **"Etapa de som" = aula (LESSON) cujas telas tocam som**, sem tipo novo de etapa.
  - Cada tela tem `audioDemos`: `[{ label, caption?, sequence }]` (notas sintetizadas) ou `[{ label, url }]` (arquivo mp3/m4a).
  - É o formato que o protótipo já usava no violão de ouvido.
  - Evita migração de enum, mudança na trilha, na importação e nos modelos de trilha.
  - O app mostra o selo "🎧 AULA DE SOM".
- **Som sintetizado no aparelho, sem arquivo e sem internet** (`@folks/shared/sound`). A sequência usa estes eventos:
  - `["n", nota]`: corda de violão;
  - `["c", tônica, ""|"m"|"dim"]`: acorde;
  - `["p", tônica, [graus 0..6]]`: progressão;
  - `["t", nota, s]`: tom puro;
  - `["r", s]`: pausa.

  A nota é MIDI ou nome ("E2"). O app gera PCM e um WAV, grava no cache (na web, um Blob) e toca com o `expo-audio`.
- **Questão "ouça e responda":** `audio` aceita três formatos:
  - `{kind:"NOTES", sequence}`;
  - `{kind:"URL", url}`;
  - `{kind:"TTS", lang, text}` (voz do aparelho, pelo `expo-speech`).

  Toca sozinha ao abrir e tem "ouvir de novo". A metodologia é `listen_choose`.
- **Microfone:** questão `SIMULATOR` com `simulator`:
  - campos: `{ id: "mic_pitch", target | targets, instrument: "violao"|"voz", toleranceCents?, holdMs?, reference?, timeLimitSec? }`;
  - metodologia `play_or_sing_note`.
  - O app escuta em tempo real e detecta a nota com o algoritmo YIN (`@folks/shared/pitch`). A captura muda por plataforma:
    - iOS e Android: `useAudioStream` (PCM) do `expo-audio`, que funciona no Expo Go;
    - web: Web Audio API.
  - Mostra o afinador (ponteiro em cents, "grave/agudo/afinado") e vale quando o aluno segura a nota afinada.
  - **Violão** confere a oitava exata. **Voz** aceita qualquer oitava.
  - O som não é gravado nem enviado: a API recebe só `{ correct, values }`, como em todo simulador.
- **Prática gerada no aparelho** (`questionSource GENERATED`): os geradores do protótipo foram portados para `@folks/shared/ear-training`, e há geradores novos.
  - Do protótipo: `pitch`, `pitch2`, `qual`, `qual2`, `deg`, `deg2`, `prog`, `prog2` e as misturas `mix`/`rev2`/`rev3`/`rev4`.
  - Novos de ouvido: `pitch_tone` (tom puro) e a mistura `ear`.
  - Novos de microfone: `tune` (afinar corda solta), `sing` (cantar a nota) e `sing_steps` (Dó-Ré-Mi), com as misturas `voice`/`guitar`.
  - O app corrige e envia só acertos e total em `POST /learning/lessons/:id/practice-result`. A API já limita o resultado (não aceita mais acertos do que questões).
- **Catálogo:** a migração `metodologias_de_som_e_microfone` traz:
  - a metodologia `play_or_sing_note` (ativa);
  - a orientação de som no `listen_choose` (só se o MASTER não tiver editado);
  - o modelo de trilha `som-e-pratica`.
- **Painel e MCP aceitam o formato completo de questão** (`content.schemas.questionSchema` = o do `folks.content/v1` + `mediaUrl`/`points`). As questões são gravadas pelo mesmo `toStorage` da importação. Antes, `add_question`, `create_planet_tree` e a importação de curso só aceitavam questões de escolha, sem som.

## Consequências
- O Claude conectado cria cursos de som pelas mesmas tools (instruções do MCP com a seção "Cursos de SOM").
- Tabuada e porcentagem (`t1`…`p4b`) ainda não são geradas no app: a prática mostra "chega numa próxima versão". Os geradores dependem do treino com repetição espaçada do protótipo.
- **Fotografia com câmera** (metodologia `photo_capture`) continua "em breve".
- O nível de detecção é bom para violão e voz: as 6 cordas soltas sintetizadas ficam abaixo de 25 cents de erro nos testes. Em ambiente barulhento, a leitura some, e a tela pede para chegar mais perto.
- Nativo: o `expo-audio` pede a permissão do microfone com o texto do `app.json`. Na loja, o aviso de privacidade deve citar o uso do microfone.
