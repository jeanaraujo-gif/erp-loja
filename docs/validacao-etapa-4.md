# Validação da etapa 4 — Estoque

Implementação: entradas, perdas, danos, devoluções avulsas, contagem física, estornos compensatórios, saldos e alertas por depósito, histórico e permissões.

- 33 testes automatizados aprovados, incluindo banco PGlite, precisão decimal, idempotência, imutabilidade, rollback de auditoria e bloqueio de saldo negativo.
- Compilação de produção e verificação TypeScript aprovadas.
- Fluxo no Edge com aplicação de produção, Prisma e rotas reais aprovado: entrada de 12 unidades, perda de 2, estorno para 12 e contagem física de 4; saída de 9 rejeitada. Acesso do vendedor à gestão de estoque bloqueado.
- Capturas desktop e celular revisadas; galeria offline atualizada com nove telas. O histórico no celular permite rolagem horizontal dentro da tabela.

## Pendência antes do uso operacional

O teste `npm run test:stock:postgres` foi preparado para conexões concorrentes em PostgreSQL nativo, mas não pôde ser concluído: a inicialização do banco foi bloqueada pela restrição de token do Windows neste ambiente. PGlite com uma conexão não comprova concorrência real. Execute esse teste em um terminal local compatível antes de considerar a concorrência validada.

Nenhum banco permanente ou dado real foi criado. Clientes é a próxima etapa funcional; vendas, financeiro e integração de devoluções com vendas permanecem fora desta entrega.
