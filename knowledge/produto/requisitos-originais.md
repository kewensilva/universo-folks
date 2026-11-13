# Requisitos originais do cliente (arquitetura.md)

> tags: requisitos, cliente, origem | fonte: arquitetura.md (texto do cliente, sem edição)

Claude, vamos estruturar uma plataforma que será desenvolvida a parte WEB e também APP, será criado para publicar nas lojas Apple store, e playstore.
Será uma plataforma MULTI-TENANT

Vamos Trabalhar com 3 frentes de projeto.
Essa Plataforma será desenvolvida para MASTER-FOLKS, ADMIN-CLIENTE, COLABORADOR-CLIENTE, ALUNO-CLIENTE.

## Quais são as diferenças dessas 4 opções de usuário?
# Para MASTER-FOLKS: é um usuário MASTER que tem total acesso e permissões ilimitadas perante toda a plataforma.
# Para ADMIN-CLIENTE: é um usuário que terá acesso total dentro da plataforma porém esse acesso total é somente em relação a base de dados da sua empresa.
# Para COLABORADOR-CLIENTE: é um usuário que terá acesso somente aos cursos e temas que foi designado a ele.
# Para ALUNO-CLIENTE: É um usuário que terá acesso total da versão PREMIUM se caso ele pagar o plano premium. (ainda não foi estipulado valores)

### REGRAS DE NEGOCIO DO UNIVERSO-FOLKS ### 

- O universo Folks será uma plataforma completa para venda de treinamentos e cursos B2B, B2C e B2G.
- Nesse escossistema, a parte de B2G terá um modelo um pouco mais exemplificado por questões burocráticas. (futuramente terá uma explicação completa).
- No universo FOLKS o MASTER será responsável por cadastrar, visualizar, editar e excluir: 
-- Clientes (que são empresas no modelo B2B, colaborador de clientes (porém a responsabilidade principal é da empresa ADMIN-CLIENTE))
-- ALUNO-CLIENTE que significa B2C, não terá muito suporte pois a ideia é que B2C faça tudo sozinho questões de contratação e etc. (suporte só em casos de problemas sérios).
-- A Parte Governamental também será de responsabilidade da MASTER, mas vamos deixar isso com mais detalhes para próximos dias, mas já vai sabendo que terá essa parte também.
-- O universo folks funcionará da seguinte forma, será criado dentro das empresas os setores/departamentos de colaboradores, e são esses colaboradores que cai no (COLABORADOR-CLIENTE), ou seja, cada usuário terá um ou mais setor/departamento. 
-- Como é um plataforma e ecossistema de ensino para B2B, então quem cria e faz a gestão de todos os vídeo e estrutura de treinamento, é a própria MASTER. 
-- Então dentro da plataforma vamos ter a area dos vídeos e práticas, como também os certificados, as certificações, criação edição de templates de certificados e etc...
-- os vídeos estão alocados no VIMEO, então lá já tem uma estrutura de pastas com os vídeos destinados aos cursos.
-- "UM PONTO QUE VOU PRECISAR QUE VOCÊ ME DE UMA SOLUÇÃO É PARA VÍDEOS INTERATIVOS QUE TERÁ PARA ALGUNS CURSOS (SCORM ou xAPI (Tin Can)), SÃO VIDEOS QUE OS ESPECTADORES IRÃO INTERAGIR, OU SEJA, AINDA NÃO EXISTE ALOCADO EM NENHUMA PLATAFORMA, E GOSTARIA QUE ME ENVIASSE SOLUÇÃO PARA FAZER INTEGRAÇÃO COM NOSSO BACK-END, E JÁ DEIXANDO CIENTE QUE TERÁ NUM FUTURO.
## ALGUMAS REGRAS DE NEGOCIO ##
### DEIXANDO CLARO QUE TODAS AS DASHBOARDS DA PLATAFORMA PRECISA MOSTRAR DADOS REAIS E EM PORCENTAGENS E TEM QUE SER UMA DASHBOARD COMPLETA COM TUDO QUE TEM DIREITO ###
# usuário de empresa terá como gerenciar seus colaboradores, também criar os departamentos, irão ver dashboard relacionado aos seus colaboradores, também poderá gerenciar quais cursos e temas e trilhas que cada departamento e setor poderá fazer ou visualizar por primeiro.
# irá modificar prioridade de cursos, por exemplo obrigatório ver o (tema tal primeiro e estipular prazo para seus colaboradores).

## importante validar que um colaborador também pode ser B2C ##
# por exemplo um colaborador poderá pagar para uso individual, e com mesmo usuário ele pode alternar entre modo individual (B2C) e modo B2B

## Modo PREMIUM E MODO GRÁTIS ##
# no modo gratis alguns cursos serão abertos e gratuitos #
# Já no modo premium os gratuitos também existirão e no caso ele liberados todos os outros que estão trancados e também libera os certificados #

## Acesso MASTER FOLKS ##
# O Acesso também vai ter o menu de configurações que será configuração geral da plataforma, e também parametrização por clientes (empresas), como por exemplo quantidade de usuários possíveis de ser cadastrados.

## PLANETAS ##
O que são os planetas? 
R: São os temas, por exemplo Planeta (comunicação), dentro do planeta comunicação existem os cursos, que são categorias de cursos (Comunicação assertiva, comunicação Não violenta, Comunicação Interpessoal e etc... )
Cada um desses cursos existe a trilha, que é seguida sempre por vídeo, e prática![alt text](image-1.png)
cada prática é relacionado ao vídeo assistido.
e no final da trilha tem a Certificação que é uma prova-final que emgloba todo o conteúdo assistido e assim que essa prova for atingido uma média (que será definido nas configuração de cada empresa) daí será liberado o certificado, (certificado daquele curso"comunicação assertiva", e depois de todos os cursos for concluídos será emitido o certificado do TEMA (PLANETA COMUNICAÇÃO, com todos os nome dos cursos que compôs aquele planeta)).

## CATEGORIAS DE ESTUDOS ##
# São categorias de estudos difentes, por exemplo terão 3 com possibilidade de o usuários MASTER CRIAR mais.
# Categorias que existem, "PARA A VIDA", "PARA TRABALHO" e "PARA ESCOLA"![alt text](image-2.png)
# ou seja, essas categorias, podem ser alternadas, por exemplo Para a vida, são planetas (musica, mecânica, dinheiro) são conhecimento para o âmbito pessoal e não profissional
# Já para o Trabalho são os Treinamentos (planetas) focados para questões profissionais, como comunicação, liderança, negociação e etc...  (planetas)

## ESSES PLANETAS E CURSOS E TRILHAS serão criados pelo (CLAUDE), ou seja, o MASTER, vai abrir o CLAUDE conectar com usuário na plataforma web, e pelo chat do claude ele irá mandar: cria para mim o planeta "comunicação e todos os detalhes, com URL dos vídeos do vimeo", e o claude irá fazer isso (preciso que você faça a instrução isso de como funcionaria e implemente)##




### VAMOS DAR A RESPONSABILIDADE A CADA ACESSO E COMO SERÁ A REGRA DE NEGOCIO DESSES USUÁRIOS E ACESSO ###
- O MASTER-FOLKS, poderá e irá criar outros acessos MASTER-FOLKS, e também excluir, só não consegue excluir a sí próprio.
- Esse acesso também será um perfil que vai ver todo o ecossistema da plataforma, relatórios, progressões, também irá ver a parte financeira de cada um de seus clientes que são os usuários geral tanto empresas como clientes alunos.


### FAÇA SOMENTE O BACK-END POR ENQUANTO ESTRUTURANDO TODO O CONTEÚDO QUE VOCÊ LEU AQUI E TAMBÉM COM OS PRINT QUE ESTÃO DISPONIVEIS ###

### STACK SERÁ JAVASCRIPT COM NODE.JS E TYPESCRIPT, O BANCO EM POSTGRESQL ###