# Etapa 4 — controle de estoque

## Entrega

Tela `/estoque` para administrador e gerente (permissão stock.manage). Inclui seleção de depósito, busca por nome/código/SKU/barras, filtros de alertas, saldos paginados, nova movimentação e histórico paginado por produto/depósito. Vendedor continua consultando o saldo total no catálogo, sem acessar a gestão do estoque. Caixa não recebe acesso adicional.

Entradas e devoluções avulsas aumentam estoque; perdas e danos diminuem. Ajuste por contagem informa o total físico encontrado e registra apenas a diferença. A contagem pode ser zero, mas um ajuste sem diferença é recusado. Quantidades usam três casas decimais, strings na API e BigInt em milésimos nos cálculos.

Devolução avulsa é apenas recebimento físico sem vínculo com venda, sem cancelamento ou reembolso. As devoluções de vendas serão integradas ao módulo de vendas. Entradas de mercadoria não geram contas a pagar nesta etapa. Transferências entre depósitos e cadastro de depósitos permanecem futuros; é possível consultar depósitos já existentes no banco.

## Integridade

O serviço bloqueia a linha do produto com FOR UPDATE, lê novamente o saldo dentro da transação, calcula a alteração, valida o resultado e grava movimentação e auditoria atomicamente. Não modifica um campo de saldo independente. O trigger da etapa 1 confere o saldo anterior e as constraints rejeitam saldo negativo. Todos os futuros escritores de estoque devem seguir o mesmo contrato de bloqueio.

A operação usa a transação padrão READ COMMITTED e bloqueio explícito do produto. Depois de adquirir o bloqueio, cada nova consulta lê o estado confirmado mais recente. Essa abordagem é específica do estoque; transações financeiras envolvendo múltiplos agregados serão projetadas nas etapas correspondentes.

Cada comando possui operationKey UUID. O banco guarda a chave com prefixo stock: e o SHA-256 do payload normalizado e do usuário. Repetir a mesma chave com os mesmos dados devolve o lançamento existente; dados ou usuário diferentes recebem HTTP 409. A interface preserva a chave enquanto o formulário permanece igual após falha, permitindo tentar novamente. Se os dados forem alterados, o comando é uma nova operação.

Contagens exigem expectedRevision, a quantidade de movimentos do produto no depósito no momento da consulta. Se qualquer movimento tiver ocorrido, inclusive se o saldo voltou ao valor anterior, a revisão muda e a contagem é recusada. Reabra/atualize a consulta e confira a quantidade física antes de reenviar.

Produtos inativos não recebem novos movimentos manuais; um estorno de movimento anterior ainda pode ser feito. Depósitos inativos são somente consulta. Limite máximo de saldo por produto/depósito: 999999999999999.999, compatível com DECIMAL(18,3).

## Estornos

Estorno cria um ADJUSTMENT de sinal contrário, vinculado ao original por reversesId único. O original não é editado nem apagado. O banco valida produto, depósito, quantidade contrária e elegibilidade. O serviço impede estornar duas vezes, estornar um estorno ou corrigir por aqui movimentos vinculados a vendas/devoluções de vendas. Estornar uma entrada exige estoque disponível suficiente.

Auditoria registra STOCK_MOVED ou STOCK_REVERSED, responsável, motivo, saldo anterior/novo, produto, depósito e vínculo do estorno. Erro na auditoria desfaz o lançamento. A movimentação guarda nome, código e unidade do produto naquele momento; registros antigos, anteriores à migração, usam o cadastro atual para exibição desses campos.

## Alertas

- Sem estoque: saldo zero.
- Estoque baixo: saldo positivo menor ou igual ao mínimo.
- Acima do máximo: saldo maior que o máximo configurado.
- Regular: demais casos.

O filtro "No mínimo ou abaixo" inclui produtos zerados. Os indicadores de alertas contam produtos ativos e respeitam a busca textual; a lista também inclui inativos identificados. Limites do cadastro são aplicados ao depósito selecionado. Não existe soma de quantidades de unidades diferentes em um indicador único.

Histórico mostra data/hora em America/Cuiaba, explicitado na tela. Configuração de fuso da loja será acrescentada posteriormente. O instante persistido continua UTC/timestamptz.

## Banco e APIs

Migração `202609140005_stock`: campos requestHash, productName, productCode, unit, reversesId; sequência para desempate do histórico; índice e trigger de validação de estornos. Não altera registros históricos nem permissões já existentes. Triggers de imutabilidade continuam ativos.

| Rota | Função |
|---|---|
| GET `/api/stock/warehouses` | Depósitos existentes |
| GET `/api/stock` | Saldos, alertas e paginação |
| GET `/api/stock/movements` | Histórico, saldo e revisão por produto/depósito |
| POST `/api/stock/movements` | Entrada, perda, dano, devolução avulsa ou contagem |
| POST `/api/stock/movements/:id/reverse` | Estorno compensatório |

Todas as rotas exigem stock.manage. Mutações preservam as verificações de sessão, Origin e JSON, com limite de 8 KiB.

## Validação e limitação atual

33 testes automatizados aprovados em PGlite, além da compilação de produção e do fluxo completo no Edge usando as rotas reais e Prisma. Cobertura de precisão, idempotência, estornos, saldo insuficiente, revisão de contagem, imutabilidade, rollback de auditoria, limites, depósitos e permissões.

`npm run test:stock:postgres` contém o teste de saídas concorrentes, reenvios concorrentes, estorno duplo e contagens concorrentes em PostgreSQL nativo. Usa binários Windows x64 de teste, cria um cluster isolado dentro de work/postgres-tests e o encerra/remove ao terminar; não usa DATABASE_URL nem instala serviço do Windows. Esse teste NÃO foi concluído neste ambiente: initdb foi impedido de criar o token restrito exigido pelo Windows. Deve ser executado em um terminal local normal antes de considerar validada a concorrência. O pacote de teste contém PostgreSQL 18.4; não define a versão recomendada para produção.

PGlite com uma conexão não comprova concorrência real. Nenhum banco permanente, serviço público ou dado real foi criado. A implementação da etapa 4 está entregue; a validação concorrente nativa permanece pendente antes do uso operacional.

Referência: [bloqueios de linha no PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).
