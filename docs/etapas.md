# Plano incremental

Antes de cada etapa: explicar escopo e arquivos, listar alterações no banco, implementar, testar os fluxos e corrigir falhas antes de avançar.

Estado atual: etapas 1 a 6 implementadas, com testes locais e navegador aprovados. A validação concorrente do estoque em PostgreSQL nativo ficou pendente por restrição do ambiente Windows. Próxima etapa funcional: crédito e vendas a prazo. Vendas à vista estão implementadas para validação local; a concorrência nativa e a preparação de produção continuam pendentes.

| Etapa | Entrega | Critério de conclusão |
|---|---|---|
| 1 | Arquitetura, schema, migrações e testes locais | Schema válido; migrações executadas em PGlite; limites documentados |
| 2 | Login, usuários e permissões | Sessão expira e revoga; acesso indevido é negado no servidor; nenhum usuário padrão inseguro |
| 3 | Produtos e categorias | Cadastro completo, unicidade, decimais e auditoria de preço |
| 4 | Estoque | Entrada, perda, ajuste e devolução com histórico; concorrência não permite saldo negativo |
| 5 | Clientes | Cadastro, validação, consulta do limite e histórico com controle de acesso |
| 6 | Vendas | PDV, busca, desconto, pagamento misto e finalização idempotente e atômica |
| 7 | Crédito e prazo | Bloqueio de limite, aprovação auditada, parcelas exatas e recomposição por pagamento |
| 8 | Fluxo de caixa | Abertura, entradas, saídas e fechamento consistente por método |
| 9 | Contas a pagar/receber | Filtros, pagamentos parciais, estornos e totais corretos |
| 10 | Dashboard | Indicadores derivados de operações válidas, com período e fuso explícitos |
| 11 | Relatórios | Agrupamentos solicitados, conciliação dos totais; exportações em evolução posterior |
| 12 | Auditoria e revisão de segurança | Revisão de acesso, concorrência, logs, backups e restauração |

As etapas 6 e 7 devem usar os contratos transacionais de caixa e títulos antes de expor operações financeiras ao uso real. As etapas 8 e 9 acrescentam telas e gestão completa; não se deve deixar uma venda finalizada sem seus efeitos financeiros enquanto se espera essas etapas.
