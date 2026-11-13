# Tipos de questão, widgets de aula e metodologias

> tags: tipos de questão, questão numérica, ordenar, montar frase, ligar pares, classificar, simulador, mito ou verdade, widget, confere rapidinho, metodologia, gerador, prática infinita, resposta do aluno | ver ADR 0011

## Tipos de questão
| Tipo | O aluno faz | Campos no conteúdo | Resposta enviada à API |
|---|---|---|---|
| `SINGLE_CHOICE` | escolhe 1 alternativa | `options[{text,isCorrect,feedback?}]` | `optionIds: [id]` |
| `MULTIPLE_CHOICE` | marca todas as certas | idem | `optionIds: [...]` |
| `TRUE_FALSE` | mito ou verdade | 2 `options` | `optionIds: [id]` |
| `NUMBER` | digita o número | `answer` (aceita "1.900"), `tolerance?` | `value: 1900` |
| `ORDER` | põe os passos em ordem | `pieces`, `answer` (mesmas peças na ordem certa) | `sequence: [...]` |
| `BUILD_SENTENCE` | monta a frase com blocos (pode ter peça a mais) | `pieces`, `answer` | `sequence: [...]` |
| `MATCH_PAIRS` | liga esquerda e direita | `pairs[{left,right}]` | `pairs: [{left,right}]` |
| `CLASSIFY` | põe cada item no grupo | `groups`, `items[{text,group,feedback?}]` | `assignments: [{item,group}]` |
| `SIMULATOR` | mexe nos sliders até a meta | `simulator{id,initial,locked}`, `note?` | `simulator: {correct, values?}` (o app aplica a regra) |

Campos comuns a todos os tipos:
- `explanation`: mostrada depois da resposta.
- `methodology`: formato de origem, por exemplo `calc_number` ou `listen_choose`.
- `timeLimitMs`: tempo da questão.
- `visual`: imagem SVG mostrada **antes** da resposta.
- `visualAfterAnswer` e `speakAfterAnswer`: mostrados só **depois** da resposta.
- `audio {kind:"TTS", lang, text}`: falado pela voz do aparelho.

## Regras
- **Toda resposta errada explica o motivo.** Nas questões de escolha isso vem no `feedback` de cada alternativa; no classificar, no `feedback` de cada item.
- A API **nunca** envia a resposta ao aluno. Peças, pares e itens chegam embaralhados, e ordenar nunca chega na ordem certa.
- Questão sem resposta conta como **erro**.
- Ligar pares: itens com o mesmo texto à direita são intercambiáveis (a correção compara pelo texto).
- Ordenar: o erro aponta o primeiro passo fora de ordem (`firstWrongIndex`).
- **Simulador:** a regra de acerto ainda roda no app. O servidor aceita o resultado e marca `selfReported` (pendência na ADR 0011).
- **Rodada:** a prática do banco com `questionsPerRound` sorteia N questões por vez.

## Telas da aula
- **Texto em partes:** `textParts`. A tela mostra uma parte por vez, nunca tudo de uma vez.
- **Confere rapidinho:** `check`, no mesmo formato de uma questão. É corrigido no app e não vale nota. Sem enunciado, recebe um padrão (por exemplo, "Ligue os pares.").
- **Widget:** `widget {type, ...dados}`. Os tipos estão na tabela abaixo.

| Widget | O que faz |
|---|---|
| `EXPLORE` | Ilustração tocável; conclui ao ver `need` partes |
| `STEPS` | Passo a passo revelado um a um |
| `FLIP` | Cartões "antes e depois" |
| `CHAT` | Conversa simulada ramificada; só conclui num final bom |
| `REFLECT` | Reflexão aberta, sem certo ou errado. **Privada do aluno: nunca aparece para o ADM da empresa** |
| `SORTG` | Classificar tocando item e grupo |
| `SIM` | Simulador com sliders |
| `MODES` | Botões dos modos da câmera |
| `PRON` | Cartões que falam a palavra em inglês |
| `PHRASE` | Frases com tradução e áudio |

Widget fora dessa lista gera aviso: exige desenvolvimento no app.

## Catálogo de metodologias (menu Metodologia, ADR 0013)
- O `methodology` da questão é o `code` de uma metodologia do catálogo do MASTER (tabela `methodologies`).
- Cada metodologia diz quais tipos de questão a desenham (`answerFormats`). Ex.: `classify` aceita `CLASSIFY` (vários itens) e `SINGLE_CHOICE` (uma frase por vez, como no Feedback).
- Situação: **ativa** (oferecida ao Claude), **inativa** (não oferecida; o conteúdo existente continua) ou **em breve** (ainda não existe no app: captura por voz, foto e vídeo).
- A importação confere e só **avisa**: metodologia fora do catálogo, inativa, em breve ou com tipo de questão que ela não usa.
- O aviso "ainda não existe no app (exige desenvolvimento)" ficou só para os **geradores** da prática infinita (`generator.methodology_unknown`): a questão é desenhada pelo tipo, o gerador precisa de código no app.

## Metodologias (geradores da prática infinita)
Na prática, `generators [{methodology, data}]` traz os dados para o app gerar questões sem fim. `questions` traz um banco já gerado, para começar sem gerador.

Metodologias conhecidas:
`adjust_simulator`, `build_sentence`, `calc_number`, `choose_action`, `classify`, `compare_images`, `contraction`, `diagnose_image`, `dialog_choice`, `fill_gap`, `identify_by_function`, `identify_on_image`, `listen_choose`, `match_pairs`, `multiple_choice`, `order_steps`, `situation_choice`, `true_false`.

A descrição de cada uma está no `formats` do `folks-cursos.json` do cliente.
