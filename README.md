# ERP para loja — etapas 1 a 6

Aplicação Next.js com login, usuários, perfis, troca de senha, produtos, categorias, movimentações de estoque, clientes e vendas à vista, sobre a base PostgreSQL. Crédito, parcelas e gestão financeira completa serão implementados nas próximas etapas; esta entrega ainda não opera uma loja completa.

[Apresentação das telas](docs/telas.html): galeria offline com capturas reais em desktop e celular e dados fictícios de demonstração.

## Executar

Para implantação em hospedagem com Node.js/PostgreSQL ou Docker, veja [Publicação para testes](docs/publicacao.md). O pacote está preparado; ainda não há endereço online configurado.

Requisitos: Node.js 22.12+ ou 24 LTS, npm e PostgreSQL 17. Testado com Node.js 24.14.1. Dependências fixadas no package-lock.json.

```powershell
npm ci
Copy-Item .env.example .env
# Edite DATABASE_URL com as credenciais do seu banco.
# Mantenha APP_ORIGIN=http://localhost:3000 no desenvolvimento local.
npm run db:validate
npm run db:generate
npm run db:deploy
npm run admin:create
npm run dev
```

Abra [a tela de login](http://localhost:3000/login). O comando `admin:create` pede nome, e-mail e senha sem exibi-la no terminal e funciona somente quando ainda não existem usuários. Não há usuário ou senha padrão. Não repita `Copy-Item` se já possui `.env` configurado.

`db:deploy` aplica as migrações ao banco configurado. Não usar `prisma db push`: as regras SQL e views complementares são obrigatórias. A terceira migração exige e-mails normalizados e únicos sem distinguir maiúsculas; revise previamente dados manuais incompatíveis, se existirem.

Contas criadas na tela de usuários devem trocar a senha inicial no primeiro acesso. Alteração de senha, perfil ou situação revoga as sessões da conta.

## Arquivos

- `prisma/schema.prisma`: entidades e relacionamentos.
- `prisma/migrations/202609140001_initial/migration.sql`: estrutura inicial gerada pelo Prisma.
- `prisma/migrations/202609140002_integrity/migration.sql`: restrições, proteção de históricos, views e perfis iniciais.
- `tests/database.test.mjs`: execução das migrações e verificações com PGlite.
- `docs/arquitetura.md`: decisões, limites e contratos das operações futuras.
- `docs/etapas.md`: critérios de implementação por etapa.
- `prisma/migrations/202609140003_auth/migration.sql`: permissões, tentativas e troca inicial de senha.
- `src/app`: telas responsivas e rotas HTTP.
- `src/modules/auth`: autenticação, autorização e validação.
- `scripts/create-admin.ts`: criação local do primeiro administrador.
- `docs/autenticacao.md`: regras de acesso, endpoints e operação.
- `docs/catalogo.md`: cadastro, decimais, auditoria e permissões dos produtos.
- `prisma/migrations/202609140004_catalog/migration.sql`: versão, datas e unicidade de categorias.
- `docs/estoque.md`: movimentos, alertas, contagens, estornos e pendência de validação concorrente.
- `prisma/migrations/202609140005_stock/migration.sql`: snapshots, chaves de reenvio e vínculos de estorno.

## Validação

```powershell
npm test
npm run typecheck
npm run build
npm run test:browser
```

Os testes de serviço aplicam as migrações em PGlite. O teste de navegador usa Microsoft Edge instalado, banco temporário em memória e uma instância local de produção do Next.js. Exercita as rotas reais via Prisma e encerra os processos ao terminar. Não usa o banco de `.env`. Gera capturas em `test-results/`; porta HTTP 3107, configurável por `TEST_PORT`.

Para executar a compilação local após configurar banco e administrador: `npm run build` e `npm start`. O servidor escuta somente na interface local. Hospedagem pública e proxy HTTPS serão configurados na implantação.

Etapa 6 implementada, com 50 testes locais e fluxo no navegador aprovados. A execução de `npm run test:stock:postgres` foi bloqueada pelo ambiente Windows; a concorrência com múltiplas conexões em PostgreSQL real permanece pendente. Não foi configurado banco permanente, criado administrador real ou publicado site. Antes de produção: concluir teste concorrente, HTTPS, gestão de segredos, backups e restauração. Próxima etapa funcional: crédito e vendas a prazo.

Clientes: consulte docs/clientes.md. A migração 202609140006_customers acrescenta versão e data de atualização do cadastro.

Vendas à vista e caixa básico: consulte docs/vendas.md. Migração 202609140007_sales. Concorrência nativa de vendas também pendente.

## Pedidos do site

A aba PEDIDOS integra o checkout Minerva ao faturamento interno. Consulte [operação e implantação coordenada](docs/pedidos.md). Aplicar a migração compartilhada antes de publicar esta versão.
