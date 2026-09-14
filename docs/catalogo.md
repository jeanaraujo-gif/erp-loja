# Etapa 3 — produtos e categorias

## Telas

- `/produtos`: catálogo paginado (25 produtos), busca literal por nome, código, SKU ou barras; filtros por categoria e situação.
- `/produtos/novo`: cadastro completo.
- `/produtos/:id`: edição para administrador/gerente e consulta para vendedor.
- `/categorias`: criação, edição e ativação/desativação de categorias.

Campos: código interno, barras, SKU, nome, descrição, categoria, marca, unidade, custo, venda, mínimo/máximo, localização, fornecedores existentes, URL HTTPS de foto e situação. Custo, lucro e margem só são retornados para usuários com products.manage. Estoque atual é consultado a partir das movimentações, sem edição direta.

Fotos nesta etapa usam URL HTTPS sem credenciais; não há upload de arquivos. A imagem é carregada pelo navegador, sem proxy no servidor e sem envio de Referer. Falha ao carregar apresenta uma indicação. O usuário deve fornecer uma imagem que tem autorização para usar.

O modelo permite múltiplos fornecedores por produto. A tela permite escolher fornecedores já existentes; o cadastro completo de fornecedores ainda não foi implementado. Fornecedores e categorias inativos já vinculados são preservados, mas não podem receber novos vínculos.

## Valores e integridade

Valores monetários chegam à API como strings e são armazenados em DECIMAL(18,2). Quantidades usam DECIMAL(18,3). A interface aceita vírgula ou ponto decimal, sem separador de milhar. Exponenciais, números JSON, negativos, excesso de casas e valores fora da precisão são rejeitados.

Lucro bruto por unidade = venda − custo. Margem = lucro / venda × 100, arredondada para duas casas, com empates afastados de zero. O cálculo compartilhado entre cliente e servidor usa inteiros BigInt de centavos, sem ponto flutuante. Lucro negativo é permitido; venda zero tem margem indefinida. Impostos e despesas não entram nesse indicador.

Código, SKU e barras são identificadores textuais únicos, preservando zeros iniciais e distinção de maiúsculas. Campos opcionais vazios viram NULL. Categorias têm nomes únicos sem distinguir maiúsculas e com espaços externos removidos.

Alterações de produto, vínculos de fornecedor e auditoria ocorrem na mesma transação. Mudanças de custo ou preço geram também PRODUCT_PRICE_CHANGED com valores anteriores/novos. Erro na auditoria desfaz toda a operação. Não há exclusão de produtos ou categorias pela API; utilize desativação.

Cada produto/categoria possui versão. A edição informa a versão lida, bloqueia o registro e compara a versão atual antes de alterar. Uma edição desatualizada recebe HTTP 409. Datas createdAt e updatedAt usam timestamptz.

## Migração e permissões

`202609140004_catalog`: acrescenta versão e datas em products/categories, valida nomes/códigos não vazios e cria unicidade de nome de categoria sem distinção de maiúsculas. Se houver categorias manuais conflitantes, revisar antes de aplicar. Não altera estoque ou lançamentos financeiros.

As rotas reutilizam sessão, autorização e CSRF da etapa 2. GET produtos/categorias exige products.read; escrita e lista de fornecedores exigem products.manage. Vendedor não recebe custo, lucro ou margem mesmo ao chamar diretamente a API. Caixa não possui permissão de consulta nesta configuração.

| Rota | Métodos |
|---|---|
| `/api/products` | GET, POST |
| `/api/products/:id` | GET, PATCH |
| `/api/categories` | GET, POST |
| `/api/categories/:id` | PATCH |
| `/api/catalog/suppliers` | GET |

Corpo de produto limitado a 16 KiB; demais mutações mantêm 8 KiB. Nenhum campo de saldo de estoque é aceito no cadastro.

## Validação

Testes de serviço cobrem precisão extrema, margem e lucro negativos, zero, formatos inválidos, URLs inseguras, unicidade, auditoria, conflito de versão, vínculos inativos, fornecedores, rollback, filtros, paginação e permissões.

O teste de navegador cadastra categoria/produto, altera preço, pesquisa pelo código de barras e verifica a consulta do vendedor pela API, além de capturar as telas desktop/celular. Dados de demonstração existem somente no banco temporário de teste. A implantação e testes concorrentes com PostgreSQL real continuam pendentes antes do uso operacional.
