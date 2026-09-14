# Validação — vendas à vista

Implementação: carrinho, quantidade fracionada, desconto com motivo, cliente, vendedor, venda aberta, pagamento misto, baixa de estoque, cancelamento integral, estorno dos pagamentos e caixa básico.

- 50 testes automatizados aprovados, sem falhas ou testes ignorados, incluindo todos os módulos anteriores e as sete migrações.
- Prisma validado e gerado; compilação de produção e verificação TypeScript aprovadas.
- Cenários de domínio: reenvios idempotentes, estoque insuficiente, pagamento incompleto, alteração de preço, falha de auditoria com rollback, caixa fechado, permissões, precisão e rateio de centavos.
- No navegador: abertura com R$ 100,00; venda de duas unidades a R$ 24,90 com desconto de R$ 5,00; pagamento de R$ 20,00 em dinheiro e R$ 24,80 em PIX; estoque de 4 para 2; cancelamento integral retornando a 4; fechamento com R$ 100,00.
- O teste inicialmente informou R$ 0,20 a mais que o total e a interface bloqueou a finalização. A entrada de teste foi corrigida para o preço efetivamente vigente no catálogo.
- Capturas de lista, carrinho, pagamento e detalhe em desktop/celular revisadas. Tabelas largas usam rolagem horizontal interna no celular.

O trigger de saldo passou a atualizar a versão existente da linha de produto sem incrementar o número, para coordenação entre os níveis de isolamento das vendas e dos ajustes manuais. Os testes locais foram repetidos após essa mudança.

## Pendência de concorrência nativa

A suíte `tests/stock-postgres.mjs` foi ampliada com disputa de estoque entre vendas, finalização e cancelamento duplicados, fechamento concorrente e venda concorrente com perda manual. A sintaxe foi verificada; a execução nativa continua pendente por causa da restrição do Windows já identificada na etapa 4. PGlite com uma conexão não comprova concorrência real. Não foi criado banco permanente nem publicada aplicação.

Fiado, parcelas e alteração de limite ficam para a etapa 7. Devoluções parciais, trocas, gestão completa de caixa e emissão fiscal não fazem parte desta entrega.
