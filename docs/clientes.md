# Clientes — etapa 5

Cadastro completo, edição, ativação e desativação em `/clientes`. Lista com busca literal por nome, nome fantasia, CPF/CNPJ, e-mail, telefone e WhatsApp; filtros de situação; paginação de 25 registros. A ficha apresenta contatos, endereço, nascimento, observações, datas e históricos.

## Regras e banco

Somente nome é obrigatório. CPF, CNPJ e CEP são armazenados sem pontuação; e-mail em minúsculas e UF em maiúsculas. Documentos têm validação de formato, sem verificação de dígitos verificadores ou consulta externa. CNPJ aceita letras nos primeiros 12 caracteres e dois dígitos finais. Datas inexistentes, futuras ou anteriores a 1900 são rejeitadas. Textos têm tamanho limitado e são renderizados como texto.

CPF e CNPJ preservam os índices únicos existentes. Cadastros sem documento podem ter nomes iguais. Não existe exclusão definitiva nem envio de mensagens aos contatos.

Migração `202609140006_customers`: acrescenta `version`, `updatedAt` e índice de busca por situação/nome. Não altera limite de crédito. Edições bloqueiam a linha e exigem versão atual; uma ficha desatualizada recebe HTTP 409. Cadastro e auditoria são gravados na mesma transação. Falha na auditoria desfaz a alteração.

Administrador e gerente possuem `customers.manage`; vendedor possui apenas `customers.read`; caixa não acessa este módulo. Sessão, permissão, origem e corpo JSON são verificados no servidor, inclusive nas rotas de histórico.

## Indicadores e históricos

- Total comprado: soma do valor original das vendas finalizadas, parcialmente devolvidas ou devolvidas. Não é receita líquida após devoluções. A tela informa essa definição.
- Quantidade e última compra: mesmas situações de venda; última compra usa a data de finalização.
- Saldo devedor e crédito disponível: leitura da view `customer_credit`, que deriva o saldo dos títulos, ajustes e alocações. Valores monetários permanecem strings decimais, sem cálculo em ponto flutuante.
- Histórico de compras: todas as situações, inclusive abertas e canceladas, identificadas na tabela.
- Histórico de pagamentos: alocações de títulos do cliente; na ausência de alocações, vínculo direto com a venda. Quando há alocações, mostra somente o valor atribuído ao cliente, evitando duplicação e mistura com outros clientes. Estornos aparecem como registros próprios.
- Históricos paginados em blocos de até 25 registros cada, ordenados por data e identificador.

Novos clientes começam sem dívida e com limite zero. Alteração de limite, venda e recebimento não são operações desta etapa; serão implementados nas etapas 6 e 7. Não há indicadores fictícios inseridos na aplicação: sem movimentos, a ficha mostra zero e históricos vazios.

## Arquivos e API

`src/modules/customers/{validation,service}.ts`, `src/lib/customers.ts`, `src/components/customers.tsx`, `src/app/(protected)/clientes/page.tsx` e `src/app/api/customers`.

| Rota | Operação |
|---|---|
| GET /api/customers | Lista e filtros |
| POST /api/customers | Cadastro |
| GET /api/customers/:id | Ficha |
| PATCH /api/customers/:id | Edição com versão |
| GET /api/customers/:id/summary | Indicadores |
| GET /api/customers/:id/history | Históricos com paginação |

Testes de domínio em `tests/customers.test.ts`; fluxo de interface em `tests/browser.mjs`. Todos usam dados fictícios e banco temporário. A pendência de concorrência do estoque em PostgreSQL nativo permanece descrita em `estoque.md`.
