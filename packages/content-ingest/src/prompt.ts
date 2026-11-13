/**
 * Prompt para o MASTER colar na MESMA conversa do Claude em que o conteúdo foi
 * criado. O Claude tem o contexto completo e devolve o JSON canônico — é o
 * caminho mais fiel para conteúdo que hoje está em texto no chat.
 */
export const CONVERSION_PROMPT = `Converta TODO o conteúdo que você criou nesta conversa (planetas/temas, cursos, trilhas, aulas, vídeos, práticas e provas) para UM único JSON no formato abaixo, para importação na plataforma Universo Folks. Responda SOMENTE com o JSON dentro de um bloco \`\`\`json.

Regras:
- Não invente conteúdo novo; use exatamente o que já foi criado. Se faltar algo (ex.: URL do vídeo), use null.
- "category": "para-a-vida", "para-o-trabalho" ou "para-a-escola".
- "key" de cada curso: "<slug-do-planeta>.<slug-do-curso>" (minúsculas, sem acento, hífen no lugar de espaço).
- Tipos de etapa: LESSON (aula em telas), VIDEO (vídeo do Vimeo), PRACTICE (questões sobre o vídeo/aula anterior), GENERATED_PRACTICE (só se já existir gerador no app).
- Cada questão: 2 a 8 alternativas e "isCorrect": true na(s) correta(s). Escolha única = exatamente 1 correta.
- "exam" é a certificação (prova final) do curso, com questões que cubram todo o curso.
- Cursos "para-o-trabalho": "hasCertificate": true e "exam" com questões.
- Planeta criado a partir de uma pasta do Vimeo: informe "vimeoFolder" no planeta (o id do link .../folder/<id>). Se a pasta tiver subpastas, cada subpasta é um curso e cada vídeo uma unidade, na ordem do número no nome.
- Cursos "para-a-vida": "accessTier" das unidades 1 e 2 = "FREE", demais "PREMIUM".
- Questões que não são de escolha (use só se já existirem na conversa):
  NUMBER {answer}; ORDER e BUILD_SENTENCE {pieces, answer}; MATCH_PAIRS {pairs:[{left,right}]};
  CLASSIFY {groups, items:[{text, group, feedback}]}; SIMULATOR {simulator:{id,...}}.
  Campos opcionais em qualquer questão: explanation, methodology, timeLimitMs, visual, audio.
- Som (cursos de música, canto, idiomas): em vez de vídeo, a etapa pode ser só SOM.
  - Sequência de notas sintetizadas no aparelho: ["n", nota] corda de violão; ["c", tônica, ""|"m"|"dim"] acorde; ["p", tônica, [graus 0..6]] progressão (0=I, 3=IV, 4=V, 5=vi); ["t", nota, segundos] tom puro; ["r", segundos] pausa. Nota = MIDI (60 = Dó central) ou nome ("E2", "C#4").
  - Tela de aula com sons: "audioDemos": [{"label":"Subiu","caption":"...","sequence":[["n",48],["n",55]]}] ou {"label":"...","url":"https://.../arquivo.mp3"}.
  - Questão "ouça e responda": "audio": {"kind":"NOTES","sequence":[...]} ou {"kind":"URL","url":"https://..."} ou {"kind":"TTS","lang":"en-US","text":"..."}; methodology "listen_choose".
  - Prática no microfone (tocar ou cantar a nota): SIMULATOR {"simulator":{"id":"mic_pitch","target":"E2" ou "targets":["E2","A2"],"instrument":"violao"|"voz"}}; methodology "play_or_sing_note". Voz aceita qualquer oitava.
- Telas (slides) podem ter textParts, widget {type,...}, check (uma questão "confere rapidinho") e audioDemos.
- Práticas podem ter questionsPerRound e generators [{methodology, data}].
- GENERATED_PRACTICE com som (gerado no aparelho): generators "pitch" (grave/agudo), "pitch_tone" (grave/agudo com tom puro), "pitch2", "qual" (maior/menor), "qual2", "deg", "deg2", "prog", "prog2", misturas "mix"/"ear"/"rev2"/"rev3"/"rev4"; no microfone: "tune" (afinar corda do violão), "sing" (cantar a nota), "sing_steps" (cantar Dó-Ré-Mi), misturas "voice"/"guitar".
- Modelo de trilha (menu Personalização de trilha): se o curso segue um modelo, informe "trailTemplate": "<code do modelo>" no curso. A prévia avisa quando a estrutura das unidades foge do modelo.
- "methodology" das questões: use o code de uma metodologia ATIVA do catálogo (menu Metodologia). Inativa, em breve ou desconhecida gera aviso na prévia.

Formato:
{
  "schemaVersion": "folks.content/v1",
  "source": { "tool": "claude", "notes": "conversa de criação dos planetas" },
  "planets": [
    {
      "key": "comunicacao",
      "slug": "comunicacao",
      "name": "Comunicação",
      "category": "para-o-trabalho",
      "description": "...",
      "accessTier": "PREMIUM",
      "vimeoFolder": "30131059",
      "courses": [
        {
          "key": "comunicacao.comunicacao-assertiva",
          "slug": "comunicacao-assertiva",
          "title": "Comunicação Assertiva",
          "description": "...",
          "hasCertificate": true,
          "units": [
            {
              "title": "O que é assertividade",
              "accessTier": null,
              "lessons": [
                { "type": "LESSON", "title": "Aula: o que é", "slides": [ { "heading": "...", "text": "..." } ] },
                { "type": "VIDEO", "title": "Vídeo", "videoTitle": "O que é assertividade", "vimeoUrl": "https://vimeo.com/123456789/abcdef" },
                { "type": "PRACTICE", "title": "Prática", "questions": [
                  { "type": "SINGLE_CHOICE", "prompt": "Ser assertivo é...", "explanation": "...",
                    "options": [ { "text": "Expressar-se com clareza e respeito", "isCorrect": true }, { "text": "Impor sua opinião", "isCorrect": false } ] }
                ] }
              ]
            }
          ],
          "exam": { "title": "Certificação", "questionSource": "BANK", "questions": [ ... ] }
        }
      ]
    }
  ]
}`;
