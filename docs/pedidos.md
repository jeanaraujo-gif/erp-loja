# Pedidos Minerva no ERP

O site e o ERP usam o mesmo PostgreSQL e o mesmo schema. O checkout grava em `store_orders`; a aba **PEDIDOS** consulta essa tabela, incluindo pedidos anteriores. Não existe cópia de dados entre aplicações nem webhook.

## Operação

1. Um responsável abre o caixa na aba Vendas.
2. Administrador, gerente ou vendedor acessa PEDIDOS e confere cliente, itens e observações. A lista atualiza a cada 30 segundos e também pelo botão Atualizar pedidos.
3. O vendedor escolhe o depósito e associa cada item do site a um produto ativo do ERP. A vitrine atual usa IDs numéricos independentes dos UUIDs do estoque: a correspondência é explícita, nunca inferida pelo nome. Cada linha deve corresponder a um produto diferente.
4. Os preços unitários e o total devem coincidir com o pedido. Cadastre os produtos e seus preços no ERP antes de faturar. Estoque e atividade do produto são revalidados no servidor.
5. Escolha um caixa aberto e o método do pagamento integral, confirme o recebimento e clique Faturar pedido. O vendedor conectado fica registrado na venda e na auditoria; o caixa pode ter sido aberto por outro operador.
6. O pedido passa a Faturado e mostra o número da venda. O link Ver venda abre seus detalhes. Nenhuma NF ou cobrança bancária é emitida. Parcelas/fiado não fazem parte deste fluxo.

Pedido pendente pode ser cancelado com motivo, sem alterar estoque. Cancelamento de venda faturada continua no fluxo existente de Vendas, restrito aos responsáveis, e aparece no detalhe do pedido como venda cancelada.

## Integridade e permissões

A permissão `orders.invoice` é concedida a ADMIN, MANAGER e SELLER. Ela não concede finalização de vendas comuns nem abertura/fechamento de caixas. Clientes da loja e caixas não acessam a fila de pedidos.

Faturamento é uma transação serializável: bloqueia o pedido, cria a venda com os preços atuais, associa o cliente, registra pagamento e caixa, baixa estoque e grava auditoria. Falhas desfazem tudo. O vínculo único `saleId` e a chave derivada do pedido impedem uma segunda venda para o mesmo pedido. Reenvio devolve a venda existente. Conflitos de serialização têm repetição limitada.

O checkout atualizado em minerva-site calcula nomes e preços no servidor a partir do catálogo compartilhado da vitrine. A chave de operação por comprador impede duplicar um pedido ao repetir a mesma solicitação. Ela é mantida durante as tentativas na mesma tela; atualizar completamente o navegador inicia uma nova solicitação.

## Implantação coordenada

Aplicar **antes** de publicar o código novo:

```sh
npm run db:deploy
```

Execute a partir de minerva-site com DATABASE_URL e DIRECT_URL apontando para o banco compartilhado de produção, em ambiente seguro. Não cole credenciais em chats. A migração nova é `202609210001_order_invoicing`; as migrações de contas e pedidos de 16/09 foram copiadas sem mudanças para o ERP, mantendo o histórico dos dois projetos compatível. Não use `db push`.

Depois da migração, publicar os dois projetos e conferir `/pedidos` com uma conta da equipe. Para instalações que aplicaram SQL manualmente, conciliar o histórico Prisma antes de usar migrate deploy; não reaplicar migrações de criação de tabelas já existentes. Não registrar uma migração como aplicada sem verificar sua execução.

## Validação

`npm test` cobre permissões, integridade e reversão total em erro, estoque insuficiente, preços divergentes, caixa fechado, cancelamento e reenvio. `npm run build` valida as rotas e a compilação.

Em minerva-site, após `npm run tools:build` e `npm run build`, execute `node tests/orders-browser.mjs`: usa banco temporário, checkout real, login de vendedor, associação de produto, faturamento, detalhe de venda e visualização móvel. Não usa o banco configurado em `.env`. Testes em PGlite não substituem uma validação de concorrência com múltiplas conexões PostgreSQL em produção.
