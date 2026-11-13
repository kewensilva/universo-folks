# Vídeos interativos (SCORM / xAPI / cmi5)

Alguns cursos terão vídeos em que o espectador interage: escolhas, quizzes dentro do vídeo, ramificações. Esses conteúdos são criados em ferramentas de autoria e exportados num **pacote .zip**. Exemplos de ferramentas: Articulate Storyline/Rise, Adobe Captivate, iSpring, H5P e Camtasia com quizzes.

A plataforma já está pronta para receber esses pacotes. **Não é preciso hospedá-los em nenhum serviço externo.** A própria API guarda os arquivos e tem um **LRS (Learning Record Store) embutido**.

## Qual padrão exportar?

| Padrão | Quando usar | Observação |
|---|---|---|
| **xAPI / cmi5** ✅ recomendado | Conteúdos novos | Registra interações detalhadas (cada clique ou resposta) e funciona em web e mobile. O cmi5 é o "xAPI com regras de launch", o sucessor moderno do SCORM. |
| **SCORM 2004 / 1.2** | Conteúdos legados ou ferramentas antigas | Só reporta status final, nota e tempo. Depende de um runtime JS no front. |

## Fluxo

```
MASTER envia .zip ──▶ POST /api/master/interactive/packages
                       ├─ detecta: imsmanifest.xml (SCORM) | tincan.xml (xAPI) | cmi5.xml (cmi5)
                       └─ extrai em storage/interactive/{id}/ (proteção contra zip-slip)

Lição INTERACTIVE ──▶ interactivePackageId (via REST ou via Claude: add_lesson)

Aluno abre a lição ──▶ GET /api/interactive/lessons/{lessonId}/launch
   • SCORM: { contentUrl, runtime: { commitUrl, token, initialCmi } }
       o front carrega o conteúdo num iframe + runtime "scorm-again"
       e faz commit em POST /api/interactive/scorm/commit
   • xAPI:  { launchUrl }  (já com endpoint, auth, actor, registration, activity_id)
   • cmi5:  { launchUrl }  (com endpoint, fetch, actor, registration, activityId)
       o conteúdo envia statements direto para /api/xapi/statements

Conclusão (SCORM completed/passed ou xAPI completed/passed na atividade raiz)
   └▶ LessonProgress COMPLETED + XP + avanço na trilha (mesmo fluxo de vídeo/prática)
```

- **Token de launch:** JWT válido por 6 horas, vinculado a um único aluno, lição e pacote. O conteúdo nunca recebe o token de login do usuário.
- **Endpoints do LRS:** `statements` (POST, PUT, GET), `activities/state`, `activities/profile`, `agents/profile` e `about`. Os documentos ficam sempre isolados por aluno.
- **Relatórios:** todos os statements ficam em `xapi_statements`, com verbo, atividade, nota e conclusão indexados. É a base para relatórios detalhados de interação (por exemplo, "em que ponto do vídeo os alunos erram mais").

## Front-end (quando for implementado)

- **Web:** iframe com o `contentUrl` ou `launchUrl`. Para SCORM, `npm i scorm-again`:
  ```js
  const api = new Scorm12API({ lmsCommitUrl: runtime.commitUrl, xhrHeaders: { Authorization: `Bearer ${runtime.token}` }, autocommit: true });
  api.loadFromJSON(runtime.initialCmi);
  window.API = api;           // SCORM 1.2  (window.API_1484_11 para 2004)
  ```
- **App (React Native / Flutter):** abrir o mesmo `launchUrl` numa WebView. Para SCORM, injetar o runtime na WebView.

## Próximos passos para produção

- Mover o storage para **S3/R2 + CDN** e servir os arquivos com URL assinada. Hoje os arquivos do pacote são públicos por UUID, sem login.
- Se no futuro for preciso integrar com um LRS corporativo de cliente (B2G costuma pedir), basta encaminhar os statements recebidos. O formato já é xAPI padrão.
