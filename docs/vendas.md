# Vendas à vista — etapa 6

`/vendas` oferece carrinho, busca por nome/código/SKU/código de barras, quantidade fracionada, desconto com motivo, cliente opcional e vendedor. Salvar cria uma venda aberta, sem reservar estoque. A venda salva não é editada: pode ser cancelada e refeita antes da finalização. Lista e detalhe preservam os registros.

## Finalização e precisão

Os preços e custos vêm do banco, nunca do valor total enviado pela tela. O cliente envia o preço esperado; alterações de preço exigem refazer a venda. Quantidade tem três casas decimais; dinheiro tem duas. BigInt calcula centavos e milésimos, com arredondamento de quantidade × preço para centavos. Desconto total é distribuído proporcionalmente pelos itens, com distribuição cumulativa dos resíduos. APIs devolvem strings decimais.

São aceitos dinheiro, PIX, débito e crédito, inclusive misturados, com soma exatamente igual ao total. Informe o dinheiro aplicado à venda após devolver o troco; não há cálculo de troco nesta versão. Totais e itens de valor bruto zero são recusados. Não se cria recebível ou dívida nesta etapa; fiado e parcelas ficam para a etapa 7.

Finalização usa transação Serializable, repetida no máximo três tentativas em conflitos transitórios. Bloqueia venda, cliente, depósito, produtos em ordem de identificador e sessão de caixa. Revalida cadastro ativo, preço, estoque, total e pagamentos. Movimentos SALE, pagamentos IN, entradas de caixa e auditoria são confirmados juntos. Falha em qualquer parte desfaz todos os efeitos. O trigger de saldo também escreve a versão existente da linha de produto, sem incrementá-la, para invalidar snapshots Serializable antigos quando concorrem com lançamentos manuais em Read Committed.

Chaves de operação e hashes do conteúdo protegem criação, finalização, cancelamento, abertura e fechamento de caixa contra reenvios. Mesma chave com conteúdo diferente é rejeitada. Repetir a finalização após um cancelamento retorna o registro existente, sem ressuscitar a venda.

## Cancelamento

Venda aberta pode ser cancelada sem lançar estoque ou pagamento. Venda finalizada só pode ser cancelada integralmente por gerente/administrador, com motivo e caixa aberto. Reposição de estoque e pagamentos OUT, vinculados aos pagamentos originais, são gravados com saídas de caixa e auditoria. Nenhum histórico é apagado.

O operador deve conferir a devolução das mercadorias e realizar os reembolsos externos antes de confirmar o registro. O sistema não executa PIX ou estorno de cartão. Caixa escolhido deve possuir saldo físico suficiente para a parte em dinheiro. Cancelamento de títulos a prazo, pagamentos já estornados ou estados de devolução exige o fluxo financeiro futuro; não é aplicado um estorno parcial improvisado.

Devoluções parciais e trocas não estão disponíveis nesta etapa. O cancelamento integral é identificado como CANCELLED, não como devolução parcial.

## Caixa básico necessário à venda

A migração cria um caixa principal, se ainda não existir. Administrador, gerente e caixa podem abri-lo, informar o saldo inicial, consultar o saldo físico e fechar com valor contado. Apenas uma sessão por caixa pode estar aberta. Operador caixa usa sua própria sessão; administradores/gerentes podem usar sessões da loja.

Somente movimentos CASH alteram o saldo físico. PIX e cartões permanecem registrados por método no histórico. Fechamento guarda esperado, contado e diferença. Trigger recusa movimento em sessão encerrada e divergência entre pagamento e movimento de caixa. Sangria, entradas manuais e gestão completa do caixa ficam para a etapa 8.

## Permissões

| Perfil | Acesso |
|---|---|
| Administrador/gerente | Preparar, selecionar vendedor ativo, finalizar e cancelar integralmente |
| Vendedor | Preparar, consultar e cancelar suas vendas abertas; sem finalizar ou operar caixa |
| Caixa | Consultar vendas, finalizar e operar sua sessão; não preparar venda nem cancelar finalizada |

As buscas específicas de vendas expõem apenas os dados necessários ao atendimento e não expõem custos. Permissões são verificadas em cada rota, junto com sessão e origem nas mutações.

## Arquivos, migração e API

- `src/modules/sales/validation.ts`: contratos de entrada e aritmética exata.
- `src/modules/sales/service.ts`: vendas, caixa mínimo e auditoria.
- `src/components/sales.tsx` e `src/app/(protected)/vendas/page.tsx`: interface.
- `src/app/api/sales`: lista, cadastro, detalhe, opções, busca, finalização, cancelamento e caixa.
- `prisma/migrations/202609140007_sales/migration.sql`: depósito, hashes/chaves, cancelamento, motivo de desconto, dados históricos dos itens, controle de reenvios de caixa e trigger.
- `src/lib/db.ts`: suporte a isolamento Serializable sem mudar as transações dos módulos anteriores.

GET/POST `/api/sales`; GET `/api/sales/:id`; POST `/api/sales/:id/finalize` e `/cancel`; GET `/api/sales/options`, `/lookup`, `/cash`; POST `/api/sales/cash/open` e `/close`.

## Validação e limites

Testes em `tests/sales.test.ts` cobrem pagamento misto, decimais e rateio, idempotência, estorno, permissões, falta de estoque, mudança de preço, rollback de auditoria e caixa fechado. O navegador usa uma aplicação de produção com Prisma e PGlite temporário, sem dados reais.

`tests/stock-postgres.mjs` também contém cenários nativos de vendas concorrentes pelo mesmo estoque, reenvio de finalização/cancelamento e corrida entre venda e fechamento, além de venda concorrente com perda manual. Execute `npm run test:stock:postgres` em ambiente Windows compatível. A inicialização do PostgreSQL nativo foi bloqueada anteriormente neste ambiente; esta suíte ampliada permanece pendente e não foi declarada aprovada. PGlite com uma conexão não comprova concorrência real.

Registro interno, sem emissão fiscal, integração bancária ou publicação. Não usar operacionalmente antes de concluir a validação concorrente e a preparação de produção descrita na arquitetura.
