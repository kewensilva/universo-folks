# Anti-pulo acumulava folga a cada chamada

> tags: aprendizado, vídeo, anti-pulo, segurança, limite por tempo | origem: teste | data: 2026-11-09

## Regra
Limites por tempo nunca podem ter folga cumulativa por requisição

## Contexto
Progresso de vídeo com avanço limitado ao tempo real de reprodução

## O que estava errado
Somar 15s de folga em toda chamada: chamadas seguidas acumulavam tempo e permitiam pular o vídeo

## O que é correto
Folga só no primeiro envio; depois no máximo 2x os segundos reais decorridos desde o último envio
