# expo-audio: useAudioStream é um esboço vazio na web

> tags: aprendizado, mobile, expo, audio, microfone, web | origem: teste | data: 2026-11-13

## Regra
Recurso nativo do Expo usado também na web precisa de versão .web.ts conferida no Expo web; não confiar que a lib implementa a web

## Contexto
Microfone em tempo real para o afinador no app (iOS, Android e Expo web)

## O que estava errado
Usar o useAudioStream também na web: o stream vem null e start() quebra

## O que é correto
Arquivo mic.web.ts com getUserMedia + AnalyserNode, mesma interface do hook nativo
