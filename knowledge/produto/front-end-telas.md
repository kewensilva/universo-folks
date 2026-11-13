# Front-end: o que existe em cada perfil (web e app)

> tags: front-end, telas, web, app, mobile, master, administrador da empresa, colaborador, aluno, login, trocar perfil, painel, trilha, prática | ver ADR 0012

## Entrada
- `/entrar`: e-mail e senha. Quem tem mais de um perfil (Master + Individual, ou empresa + Individual) vai para `/contexto`.
- `/contexto` ("Entrar como"): Master, cada empresa (como admin ou colaborador) e Individual. A troca é feita pela API (`/auth/switch-context`). Dá para voltar a ela pelo menu do usuário.
- Sair revoga o refresh token no servidor.

## Web (`apps/web`)
### MASTER (`/master`) — gestão de toda a plataforma
| Menu | O que faz |
|---|---|
| Visão geral | Empresas, pessoas, engajamento, MRR/ARR, receita por mês, público, aprendizagem, planetas mais estudados; relatório geral em CSV |
| Empresas | Lista com filtros e uso das cotas; **cadastro** (dados, cotas de colaboradores e de administradores, primeiro admin por convite). Detalhe com abas: Painel, Pessoas, Departamentos, Planetas, Trilhas, Engajamento, Cotas e regras (cotas, nota, tentativas, fluxo, contrato, Premium incluído), Financeiro (assinaturas, contrato no Asaas, pagamentos manuais) e Dados (editar, novo código, suspender/reativar, encerrar) |
| Pessoas e alunos | Todos/B2C/Premium com busca; detalhe com vínculos, cursos, certificados, assinaturas e pagamentos; desativar/reativar acesso; conceder Premium |
| Conteúdo | Planetas (filtros, situação, criar/editar) e categorias; árvore do planeta: cursos (editar, modelo de trilha com o selo segue/foge, publicar, arquivar/excluir), unidades (título, acesso, cor), etapas (título, XP, link do Vimeo, questões por rodada) e questões com a resposta certa, prova final. **Organizar vídeos** (botão no planeta): quadro do planeta inteiro com a pasta do Vimeo e as subpastas ao lado; aponta equívocos (sem vídeo, repetido, de outro módulo, fora de ordem, não usado); trocar vídeo pela pasta, permutar entre etapas (inclusive de cursos diferentes), reordenar unidades e etapas, corrigir títulos. Tudo fica pendente até "Salvar" (uma transação) e avisa quando a etapa já tem alunos com progresso |
| Metodologia | Catálogo das práticas (mito ou verdade, múltipla escolha, ligar pares… e captura por voz, foto e vídeo como "em breve"): resposta do aluno, orientação para o Claude, tempo padrão, situação (ativa, inativa, em breve) e uso em questões. Criar, editar, desativar; excluir só as criadas pelo MASTER e sem uso (ADR 0013) |
| Personalização de trilha | Modelos de estrutura da trilha (cada unidade: etapas em ordem com mín/máx; unidade final própria; nº de unidades; desafio final; metodologias permitidas), com prévia ao vivo. O curso escolhe o modelo em Conteúdo e mostra se segue ou foge dele (ADR 0013) |
| Importações | Enviar arquivos ou colar texto/JSON, prompt de conversão para o Claude, prévia (criar/atualizar/conflito), problemas, editar o JSON normalizado, gravar (rascunho ou publicado), descartar |
| Vídeos (Vimeo) | Status da conexão, pastas, ligar pasta a curso (prévia e aplicar), sincronizar |
| Certificados | Modelos (HTML) com prévia, padrão por tipo, revogar certificado |
| Planos | Básico, Premium e Premium Plus em cartões: o que cada um libera (gratuito + galáxias, acrescentar/tirar galáxia com um clique), preços ligados, assinaturas ativas e comparativo. Editor: nome, descrição, galáxias, "todas as galáxias", plano de quem não assina, ativo; excluir só sem preços (ADR 0014) |
| Financeiro | Por empresa (MRR, recebido, pendente), pagamentos e preços (criar/editar; cada preço do aluno aponta para um plano) |
| Masters | Criar e remover Masters (não remove a si mesmo) |
| Integração Claude | Tokens do conector MCP (gerar, mostrar uma vez, revogar) e como conectar |
| Configurações | Padrões de empresa, plano grátis, XP, anti-pulo, e-mail de suporte |

### Administrador da empresa (`/empresa`)
| Menu | O que faz |
|---|---|
| Visão geral | Licenças, ativos, nunca acessaram, trilhas obrigatórias, por departamento, cursos liberados, ranking |
| Pessoas | Filtros (setor, papel, situação); **convidar**, **importar planilha** (nome; e-mail; setor; cargo), editar papel/setores/cargo/acesso, reenviar convite, remover, **lembrete por e-mail** para selecionados, cursos de cada pessoa |
| Departamentos | Criar, editar (com setor pai), remover |
| Planetas liberados | Liberar para todos ou por setor, bloquear |
| Trilhas obrigatórias | Criar/editar (curso ou planeta; empresa, setor ou pessoa; obrigatória; início, prazo, prioridade), reordenar, remover |
| Engajamento e relatórios | Engajamento semanal/mensal e relatório CSV para Excel |
| Regras da empresa | Nota mínima, tentativas, espera, fluxo sequencial; cotas e código (só leitura) |

O MASTER vê tudo isso dentro do detalhe de cada empresa (mesmos componentes, `components/company/*`).

### Colaborador e aluno (`/estudar`)
Início, cursos, planeta, trilha, **vídeo do Vimeo**, aula em telas e prática com todos os tipos de questão (corrigida no servidor).

## App (`apps/mobile`)
- **Visual do protótipo (`src/components/space/`):**
  - **fundo espacial animado** em todas as telas: nebulosas, estrelas em 3 camadas andando em paralaxe, estrelas piscando e cometa; fica parado com "reduzir movimento";
  - **trilha em caminho**: faixa colorida da unidade (cadeado com o plano quando bloqueada), etapas redondas em zigue-zague com volume, etapa atual maior com anel pulsando e balão "COMEÇAR"/"CONTINUAR", figurinhas do planeta flutuando (`visual.orbitIcons`) e o **astronauta** do tema ao lado (`visual.look`: cabeça, pose, objeto, ex.: placa ✓ no Feedback);
  - **astronauta guia** com balão nas aulas em telas (falas do protótipo), acenando no vídeo e comemorando ao concluir etapa ou prática.
  - O desenho do astronauta e os ícones são os SVG do protótipo (`astro-art.js`, `icons.ts`), animados com Reanimated.
- **Entrada no app:**
  - **Entrar:** e-mail e senha, com o **botão de mostrar/ocultar a senha** (olho). O mesmo campo é usado em todas as senhas do app.
  - **Criar conta grátis** (`/cadastro`): nome, e-mail, data de nascimento (DD/MM/AAAA, obrigatória: define menor de idade) e senha; código da empresa opcional ("Tenho um código da minha empresa"). Chama `POST /auth/register` e já entra logado: sem código, como aluno **B2C no plano Básico**; com código, como colaborador da empresa.
- **Abas (como no protótipo):** Início, Cursos, **Hangar**, **Empresa** (só colaborador) ou **Premium** (só aluno B2C) e **Ajustes**.
  - **Hangar** (personalização do astronauta): traje, detalhes, viseira, cabeça e costas (`GET /me/hangar`, `PUT /me/hangar/:itemId`). Item liberado por nível (cada 200 XP) ou exclusivo Premium; tocar num bloqueado explica o que falta. A roupa escolhida aparece no **astronauta de todas as telas** (`outfitOf` no `@folks/shared`); o figurino do planeta (cabeça, costas, objeto) continua por cima.
  - **Empresa:** empresa, situação (Em dia, Atrasado…), áreas, trilhas obrigatórias com progresso e prazo (tocar abre o curso) e ranking das áreas (`GET /me/company`).
  - **Premium:** plano atual, benefícios e os planos de acesso do menu Planos do MASTER (Básico, Premium, Premium Plus) com as galáxias e os preços ativos (`GET /billing/tiers`, público). Preço zerado ou sem preço ativo aparece como "Preço em breve". A compra é pelas lojas (RevenueCat, `src/lib/purchases.ts`); enquanto o SDK e as chaves não estão configurados, "Assinar" e "Restaurar compras" explicam que a assinatura chega na versão publicada. Quem está na empresa não vê o Premium.
  - **Ajustes:** perfil (como quer ser chamado), Experiência (efeitos sonoros, cronômetro, **reduzir animações**, meta diária 20/50/100/150 XP, lembrete e horário), Empresa (entrar com código, só para quem não tem empresa), trocar perfil, Conta (trocar senha, assinatura, sair). "Reduzir animações" para o fundo, o astronauta e a trilha, assim como o "reduzir movimento" do aparelho (`useStill`).
- **Som e microfone (ADR 0015):**
  - **Aula de som:** telas com botões "Ouvir" (notas, acordes e tons sintetizados no aparelho, sem internet, ou arquivo de áudio); selo "🎧 AULA DE SOM".
  - **Ouça e responda:** a questão toca o som sozinha e tem "Ouvir de novo"; a voz do aparelho (TTS) também toca.
  - **Microfone:** questão `mic_pitch` mostra a nota pedida, "Ouvir como deve soar" (o microfone pausa enquanto toca), "Ligar o microfone" e o afinador com ponteiro (grave ↔ agudo, em cents), "Segure afinado" e o tempo. Violão confere a oitava; voz aceita qualquer oitava. Nada é gravado. Sem permissão, a tela explica como liberar.
  - **Prática gerada:** treino de ouvido e microfone gerado no aparelho (cada rodada é nova), com acerto/erro, explicação e som de acerto (respeita "Efeitos sonoros"); no fim envia acertos/total e oferece "Próxima etapa" e "Treinar de novo".
- **Planeta e trilha:** Tocar numa etapa liberada (ou em "Continuar") abre a etapa: **vídeo do Vimeo** (WebView com o player oficial), **aula em telas** e **prática** (mesmos tipos de questão da web). Ao concluir, "Próxima etapa" segue a trilha.
- **MASTER e ADMIN:** tela "o painel fica na web", com a opção de estudar como Individual (ou na empresa).

## Comportamentos comuns (web e app)
- **Servidor fora do ar não derruba a sessão.** Se a renovação falha por rede, a tela mostra "Sem conexão com o servidor" com "Tentar de novo" e nova tentativa automática a cada 5 s; só 401 na renovação manda para o login.
- **Editar e apagar um campo limpa o valor no banco** (vai `null` ou texto vazio, não é omitido). Ao criar, campo vazio é omitido.
- **Vídeo (web e app):** só a reprodução contínua conta (arrastar a barra não conta; `createWatchTracker` no `@folks/shared`). O progresso vai para `POST /learning/lessons/:id/video-progress` a cada 10 s, na pausa e no fim; a API aplica o anti-pulo e conclui ao atingir `minWatchPct` (90%). Rever um vídeo já concluído conta engajamento uma vez (no fim), sem XP.
- **Visual das questões (web e app):** `parseVisual` (`@folks/shared`) transforma o visual em dados: SVG, imagem, frase com lacuna (`gapln`/`gapb`), diálogo (`dlgq` com `dlgctx` e `dlgb them/me`) ou texto. O HTML do conteúdo nunca é injetado na tela (só o SVG, na web).
- **Datas sem hora** (prazo, contrato) são mostradas e enviadas como dia, sem fuso (`fmt.dateOnly` / `fmt.dayToIso`).

## Ainda não feito (próximas entregas)
- **Web e app:** desafio final (certificação). **App:** prática gerada de tabuada e porcentagem (a de música e microfone já existe). **Web:** toca o som das questões ("Ouvir"); aula de som, microfone e prática gerada ainda não.
- **App:** fotografia com câmera (metodologia `photo_capture`) ainda em breve.
- **Ambos:** widgets das telas (CHAT, FLIP, SORTG, REFLECT…) mostram "chega em breve".
- **Ambos:** widgets das telas (EXPLORE, CHAT, REFLECT…), simuladores e prática infinita com geradores.
- **App:** compra do Premium nas lojas: falta instalar o `react-native-purchases`, criar os produtos na App Store e no Google Play, preencher `appleProductId`/`googleProductId` nos preços e gerar um build de desenvolvimento (o Expo Go não faz compra). Hangar e Premium ainda não existem na web.
- **Contas:** "esqueci minha senha", aceitar convite e nova senha (o cadastro grátis já existe no app). Hoje o e-mail de convite aponta para `APP_URL/convite` (padrão `localhost:5173`, da v0) e a web não tem `/convite` nem `/nova-senha`: quem é convidado não consegue concluir o cadastro pela web nova.
- **Gestão:** editor de texto das telas e questões no painel (hoje o conteúdo vem do Claude/importação), "ver como" empresa/colaborador, B2G detalhado.
- **Arte:** planetas e astronauta em SVG, como no protótipo (hoje é uma aproximação).
