# Arquitetura

## Escopo

Uma empresa, uma moeda (BRL) e um estoque principal inicialmente. Depósitos possuem identidade própria para permitir transferências posteriores. Multiempresa exige adicionar isolamento por empresa em todas as entidades antes de compartilhar a mesma instalação; não está implementado.

Monólito modular: Next.js, React, TypeScript e Tailwind na interface futura; serviços de aplicação no servidor; Prisma e PostgreSQL na persistência. Rotas HTTP devem validar entrada e sessão, exigir permissão e chamar serviços. A interface nunca decide autorização, preço final, saldo ou aprovação de crédito.

Estrutura: `src/app` para páginas e rotas, `src/modules` para serviços de cada domínio e `src/lib` para banco e autenticação. Etapas 2 e 3 acrescentaram autenticação e catálogo. A etapa 4 acrescentou movimentos manuais e estornos de estoque, detalhados em `estoque.md`; a concorrência nativa permanece pendente de execução. A etapa 5 acrescentou cadastro e consulta de clientes, detalhados em clientes.md. A etapa 6 implementou vendas à vista, cancelamento integral e caixa básico, descritos em vendas.md. Crédito, parcelas e gestão completa de caixa permanecem nas próximas etapas.

## Modelo

Usuários pertencem a um perfil; perfis recebem permissões pela associação role_permissions. Sessões guardam somente hash do token, expiração e revogação. Senhas e sessões foram implementadas na etapa 2, detalhada em `autenticacao.md`; nenhuma senha padrão é criada.

Produtos têm categoria e múltiplos fornecedores. Estoque atual é a soma de movimentos por produto e depósito, exposta em stock_balances; não existe campo de saldo editável. Movimentos guardam quantidade assinada, antes, depois, responsável e motivo. O trigger bloqueia o produto e verifica o saldo anterior; o serviço de estoque manual usa Read Committed com bloqueio explícito do produto durante a transação. Os fluxos financeiros futuros têm contratos próprios abaixo.

Vendas têm itens com descrição, preço e custo históricos, vendedor e cliente opcional. O cliente é obrigatório para gerar parcelas. Pagamento misto é representado por vários pagamentos, cada qual com seu método. Fiado é uma obrigação a receber; não é entrada de dinheiro. Devoluções têm cabeçalho e itens vinculados aos itens originais.

Contas a receber guardam parcelas; pagamentos são distribuídos entre títulos por allocations. Ajustes assinados alteram a obrigação em devoluções: valor negativo reduz a dívida. Estorno de recebimento é novo pagamento OUT vinculado ao original e alocado às mesmas parcelas. As views receivable_balances e customer_credit calculam dívida e crédito. Situação paga/parcial/pendente/vencida será derivada do saldo e da data local, sem status cronológico persistido. Limite utilizado não é duplicado em outra tabela.

Contas a pagar representam despesas e compras, com fornecedor opcional. Não há tabela expenses duplicando a obrigação. Payments OUT e payable_allocations representam quitação; estornos IN reabrem o saldo. O histórico de contas por fornecedor estará disponível, mas compras detalhadas e recebimento de mercadorias terão fluxo próprio na etapa de estoque.

Caixa tem sessões de abertura e fechamento, e movimentos por método. Saldo físico = abertura + entradas CASH − saídas CASH. PIX e cartões aparecem no resumo por método, sem aumentar dinheiro físico. O campo expectedBalance registra o esperado no fechamento; diferença = contado − esperado. Esta é uma gestão operacional, sem conciliação bancária ou de recebíveis de adquirentes nesta fase.

## Precisão e datas

Valores monetários NUMERIC(18,2); quantidades NUMERIC(18,3). APIs futuras recebem decimais como strings e calculam com aritmética decimal exata (BigInt em centavos/milésimos nos serviços atuais); nunca Number para valores financeiros. Total do item = round(quantidade × preço unitário, 2) − desconto. Distribuição de parcelas em centavos, com resíduo na última parcela, garante soma exata. Margem bruta = (venda − custo) / venda × 100; preço zero apresenta margem indefinida, sem divisão por zero. Markup sobre custo é indicador distinto.

Instantes usam timestamptz; vencimentos e nascimento usam date. Fuso da loja será configurável; usar America/Cuiaba inicialmente apenas como configuração proposta, a confirmar ao configurar a loja.

## Contratos obrigatórios dos serviços futuros

Estas regras descrevem implementações das próximas etapas; o esquema sozinho NÃO as garante.

1. Finalizar venda: verificar permissão, chave idempotente e status OPEN; bloquear cliente e produtos em ordem determinística; recalcular valores no servidor; verificar estoque; calcular dívida atual; exigir cliente no prazo e aprovação de gerente/admin com motivo quando exceder limite; inserir itens, movimentos, pagamentos de entrada, parcelas, caixa e auditoria; finalizar dentro da mesma transação serializável. Repetir conflitos com limite; não repetir efeitos externos.
2. Receber parcela: bloquear título e caixa aberto; rejeitar valor maior que saldo; criar pagamento, alocação e movimento de caixa na mesma transação; impedir alocar a outro cliente ou acima do pagamento. Recebimentos devem liberar crédito pelo valor efetivamente alocado.
3. Cancelar/devolver: bloquear venda e itens; impedir devolver mais que vendido menos devolvido; calcular valor pela composição original de desconto; repor estoque; reduzir dívida ainda aberta por ajuste e reembolsar apenas valores efetivamente pagos; registrar estorno vinculado e auditoria. Nunca apagar registros. Cancelamento de venda aberta não repõe estoque ainda não baixado.
4. Pagar despesa: bloquear título e sessão aberta; verificar saldo do título e permissão; criar pagamento, alocação, saída e auditoria atomicamente.
5. Fechar caixa: bloquear sessão; calcular esperado por método; registrar contado, diferença, responsável e instante. Novos movimentos devem bloquear a sessão e rejeitar caixa fechado.
6. Alterar preço/limite: verificar permissão, bloquear entidade e registrar antes/depois e motivo na mesma transação.

Devem ainda ser implementadas validações cruzadas de cliente/título, soma dos itens, soma de alocações, limites das devoluções, autorização de crédito, consistência de estornos e vinculação de cada pagamento ao caixa. As restrições atuais garantem formatos, referências, unicidade e integridade local, não todos os fluxos de negócio.

## Segurança e operação

Usuário de migração separado do usuário da aplicação; aplicação sem privilégios de DDL ou de desabilitar triggers. Históricos imutáveis por trigger, inclusive auditoria; o administrador do banco continua tecnicamente capaz de alterar dados, portanto auditoria externa e backups são necessários para produção.

Etapa 2: hash de senha resistente, cookie HttpOnly/Secure/SameSite, expiração e revogação de sessão, proteção CSRF, limitação de tentativas e autorização negada por padrão em cada endpoint. Nunca colocar hashes, tokens ou dados pessoais completos em logs. Etapa 12 consolida a revisão; segurança será aplicada desde o primeiro endpoint.

Antes de produção: testes concorrentes em PostgreSQL, revisão de permissões, backup automatizado com restauração testada, HTTPS e gestão de segredos. Emissão fiscal, integração bancária, cobrança automática e aplicativo mobile não fazem parte desta entrega.

## Referências técnicas

- Prisma, tipos e Decimal: https://docs.prisma.io/docs/orm/reference/prisma-schema-reference
- Prisma 6, transações e isolamento: https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions
