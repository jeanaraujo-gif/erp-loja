# Validação — clientes

- 40 testes automatizados aprovados, sem falhas ou testes ignorados. Incluem todas as migrações, permissões, cadastro, unicidade, versões de edição, rollback de auditoria, busca, paginação e consulta financeira exata.
- Schema Prisma validado; cliente Prisma gerado; compilação de produção e TypeScript aprovados.
- Fluxo completo no Edge com Prisma, API real e banco temporário aprovado: cadastro, edição, desativação, filtro de inativos, reativação e busca por e-mail.
- Vendedor consultou a ficha e os históricos; botão de edição ausente e tentativa de cadastro via API rejeitada com HTTP 403.
- Capturas de lista, cadastro e ficha em desktop e celular revisadas; verificações de largura da página sem transbordamento horizontal.
- Galeria offline atualizada com 12 telas.

Foram corrigidos o nome acessível do filtro de situação e a aceitação indevida de documentos compostos somente por pontuação. Indicadores com valores foram testados com registros sintéticos; as capturas exibem o estado real sem compras ou pagamentos.

Não houve criação de banco permanente nem publicação. A validação de concorrência de estoque em PostgreSQL nativo continua pendente por restrição do Windows, conforme a documentação da etapa 4. Vendas e operações de crédito serão desenvolvidas nas etapas seguintes.
