# Publicação para testes

A entrega preparada para publicação contém as etapas 1 a 6. Crédito, fiado e parcelas ainda não estão implementados. A galeria de capturas não substitui a aplicação funcional.

O ERP exige Node.js e PostgreSQL. O pacote Docker executa o mesmo código Next.js validado localmente; não substitui o banco por dados no navegador. Não há endereço online criado ou conta de hospedagem vinculada nesta entrega.

## Configuração

- DATABASE_URL: conexão privada com PostgreSQL, configurada nos segredos do provedor.
- APP_ORIGIN: origem HTTPS exata do endereço publicado, sem barra final ou caminho.
- PORT: porta interna fornecida pelo provedor, padrão 3000.
- Comando de build sem Docker: npm ci, npm run db:generate, npm run tools:build, npm run build.
- Comando anterior ao primeiro início/atualização: npm run db:deploy.
- Comando de início: npm run start:hosted.
- Health check: GET /api/health. Confirma conexão; não divulga credenciais ou registros.

As migrações devem concluir antes de disponibilizar a nova versão. Não use prisma db push, pois views e triggers são parte das migrações.

## Contêiner em servidor com Docker

1. Crie um arquivo privado de ambiente fora do pacote, com APP_ORIGIN e POSTGRES_PASSWORD. Para o compose fornecido, use senha aleatória hexadecimal com pelo menos 64 caracteres, evitando caracteres reservados em URLs.
2. Execute docker compose --env-file CAMINHO_PRIVADO up --build -d.
3. Configure o proxy HTTPS do servidor para 127.0.0.1:3000. O PostgreSQL não publica porta externa.
4. Crie o primeiro administrador em terminal interativo: docker compose --env-file CAMINHO_PRIVADO exec app node .tools/scripts/create-admin.js.
5. Acesse o endereço configurado em APP_ORIGIN, entre e cadastre apenas dados fictícios de teste.

A criação de administrador continua exclusiva do terminal. Não foi adicionada rota pública de cadastro nem senha padrão. A imagem roda como usuário não privilegiado. O volume erp_data mantém o banco entre reinícios; não use down -v se precisar preservar os testes.

## Estado de validação

O ambiente atual não possui Docker, portanto a imagem e o compose não foram executados aqui. A compilação, migrações temporárias e fluxos de aplicação têm testes separados. Antes do uso operacional, executar a suíte concorrente no PostgreSQL nativo e validar backup/restauração e HTTPS.

Para concluir a publicação é necessária uma conta de hospedagem compatível e acesso de implantação, além de banco PostgreSQL. Configure segredos diretamente no provedor; não os envie no chat. Custos e contratação dependem do serviço escolhido.
