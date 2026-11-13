# Área de estudo sem player de vídeo e questões sem o visual em HTML

> tags: aprendizado, front-end, app, video, vimeo, questoes | origem: usuario | data: 2026-11-13

## Regra
Antes de dizer que uma área está pronta, percorra o fluxo do aluno de ponta a ponta com o conteúdo real do cliente em web e app; todo kind de visual/widget do formato canônico precisa ser desenhado ou mostrar um aviso honesto.

## Contexto
O usuário testou o Feedback como aluno: a web dizia que o vídeo só funcionava no app, e no app o CONTINUAR da trilha era só um rótulo (não havia tela de etapa). Na prática, a frase a julgar (visual HTML de diálogo) não aparecia em nenhuma das duas.

## O que estava errado
Entregar a trilha do app sem o player das etapas e com um rótulo que parecia botão; renderizar só visual SVG e ignorar o kind HTML (gapln/dlgq) que o conteúdo do Claude usa em 137 questões.

## O que é correto
Web e app com vídeo do Vimeo (player oficial; progresso a cada 10 s, anti-pulo no servidor), aula em telas e prática; etapas tocáveis no app; parseVisual no @folks/shared transforma o HTML (lacuna, diálogo, contexto) em dados desenhados nas duas plataformas, sem injetar HTML.
