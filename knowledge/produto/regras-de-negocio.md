# Regras de negócio

> tags: regras, trilha, certificação, prova, premium, grátis, gamificação, xp, empresa, licenças | fontes: arquitetura.md, protótipo, decisões do cliente

## 1. Conteúdo
- Hierarquia: **Categoria → Planeta → Curso → Unidade → Etapas → Desafio final**.
- Categorias iniciais: "Para a vida", "Para o trabalho", "Para a escola". O MASTER pode criar mais.
- Tipos de etapa:
  - **aula em telas** (slides);
  - **vídeo** (Vimeo);
  - **prática**, com questões do banco ou exercícios gerados no app;
  - **revisão**;
  - **interativo** (SCORM/xAPI/cmi5).
- Cada prática é relacionada ao vídeo ou à aula assistida.
- Status: rascunho, em breve, publicado, arquivado. Conteúdo com progresso de alunos é **arquivado, nunca apagado**.

## 2. Trilha
- **Sequencial:** cada etapa libera a próxima. A empresa pode desligar isso.
- **Prática infinita:** libera depois da primeira aula concluída do curso.
- **Desafio final / certificação:** libera quando todas as etapas estão concluídas.
- **Vídeo:**
  - conclui com 90% assistido;
  - o tempo só avança no ritmo real (até 2×), com anti-pulo;
  - o MASTER pode desligar o anti-pulo.

## 3. Certificação e certificados
- Nota mínima: a da prova, se ela definir; senão a da empresa (padrão 80%); senão a da plataforma (80%).
  - Isso reproduz o protótipo: 8 de 10 na prova gerada, 4 de 5 no Feedback.
- Tentativas limitadas por empresa (padrão 3). Esgotadas, libera uma nova tentativa a cada *cooldown* (24h).
- Aprovado em curso com certificado: recebe o **certificado do curso**.
- Concluiu todos os cursos certificáveis do planeta: recebe o **certificado do planeta**, com o nome de todos os cursos.
- Curso sem certificado pode dar uma **insígnia** ao ser concluído (ex.: "Tabuada na Cabeça").
- Todo certificado tem código público de verificação, e os templates são editáveis pelo MASTER.

## 4. Plano grátis × Premium × empresa
| | Grátis (B2C) | Premium (B2C) | Empresa (B2B) |
|---|---|---|---|
| Unidades | 1 e 2 de cada curso | todas | todas as liberadas para o departamento |
| Desafio final / certificado | não | sim | sim |
| Prática infinita | 1 rodada/dia, 12 exercícios | ilimitada | ilimitada |
| Jam (jogo) | 1/dia | ilimitada | ilimitada |
| Anúncio com recompensa | só adultos | nunca | nunca |

- Limite atingido: **409 `daily_limit`**. O adulto pode ganhar uma rodada extra assistindo anúncio (verificado por SSV do AdMob).
- Quem passou na prova no grátis e assina depois **resgata o certificado**.

### 4.1 Planos do aluno: Básico, Premium e Premium Plus (menu Planos, ADR 0014)
| Plano | O que libera | Preço |
|---|---|---|
| **Básico** | só os cursos e unidades **gratuitos** (de todas as galáxias). É o plano de **quem não assina**. | grátis |
| **Premium** | gratuito + galáxias **Para a vida** e **Para o trabalho** completas | Premium Mensal / Anual |
| **Premium Plus** | **todas as galáxias** (Para a vida, Para o trabalho, Para a escola e as que forem criadas) | a definir |

- O MASTER escolhe as galáxias de cada plano no menu **Planos** (acrescentar ou tirar galáxia vale na hora para quem já assina).
- Cada **preço** (Financeiro: mensal, anual, produto da loja) aponta para um plano. Preço do aluno **sem plano** libera todas as galáxias (comportamento antigo); a tela de Planos avisa.
- Exatamente **um** plano é o "de quem não assina"; ele não pode ser excluído nem desativado.
- Quem tem duas assinaturas vale a soma das galáxias; o plano exibido é o mais alto (ordem do menu).
- O plano decide só **o conteúdo Premium por galáxia**. Certificado, prática infinita e jam ilimitados e a ausência de anúncio continuam valendo para **qualquer assinatura paga**.
- Bloqueado por plano: a API responde `PREMIUM_REQUIRED` + `requiredPlan` (o plano mais barato que libera, ex.: "Premium Plus"); o app mostra "🔒 Premium Plus".
- **Empresas (B2B) não usam estes planos**: o acesso vem dos planetas liberados no contrato e do "Premium incluído" (`grantsPremiumAccess`).

## 5. Gamificação
- XP por aula (5), vídeo e prática (10 por acerto, com bônus por resposta rápida quando o cronômetro está ligado), prova aprovada (50) e jogo.
- **Teto de XP por evento:** aula = 10; demais = `max(10, total) × 40 + 100`.
- Nível a cada 200 XP. **Jornada** = dias seguidos com atividade. Meta diária de 20, 50, 100 ou 150 XP.
- **Engajamento:** pessoa engajada no dia = pelo menos uma atividade (fuso America/Sao_Paulo).
- Hangar: itens do astronauta (traje, detalhe, viseira, cabeça, costas) liberados por nível; alguns só no Premium.

## 6. Empresa
- **Licenças:** o MASTER define **duas cotas separadas** por empresa: **colaboradores** e **administradores** (0 = sem limite). Convidados e ativos ocupam licença.
  - Promover alguém a ADMIN exige vaga na cota de administradores e libera uma vaga de colaborador.
  - Não é possível baixar uma cota abaixo do uso.
  - O ADMIN da empresa não altera as próprias cotas.
- **Entrada na empresa:** convite por e-mail (link de 14 dias para criar a senha) ou **código da empresa** (ex.: `ORBITA-2026`).
- **Departamentos:** cada pessoa pode estar em um ou mais.
- **Liberação de planetas:** a empresa liga e desliga cada planeta e escolhe os departamentos com acesso ("Todas" ou uma lista).
- **Trilhas obrigatórias:** com prioridade e prazo, por empresa, departamento ou pessoa.
- **Situação de cada pessoa:** Convite enviado, Em dia, Atrasado (trilha vencida e incompleta), Não começou ou Concluiu.
- **Lembretes** por e-mail para quem está atrasado ou não começou.
- **Relatório CSV** que abre direto no Excel em pt-BR (BOM + `;`).
- **Empresa suspensa:** o painel é bloqueado e os colaboradores perdem os benefícios.

## 7. Conta
- Cadastro B2C exige **data de nascimento** (define se a pessoa é menor de idade). A data só pode ser informada uma vez.
- "Esqueci minha senha": link de 1 hora.
- **Apagar conta (LGPD):** anonimiza os dados, encerra sessões e vínculos. O único ADMIN de uma empresa precisa nomear outro antes.
- Rate limit em login, cadastro e senha (10/min; "esqueci" 5/min).
