# Etapa 2 — login, usuários e permissões

## Implementação

Telas de login, início, minha conta e usuários em português, adaptadas a desktop e celular. O início não apresenta indicadores fictícios. As permissões dos módulos futuros estão cadastradas, mas os módulos ainda serão implementados.

Senhas usam scrypt com sal aleatório de 16 bytes, N=65536, r=8, p=2 e chave de 64 bytes. Verificação compara buffers em tempo constante. Senhas novas têm entre 12 e 128 caracteres, sem truncamento ou normalização. E-mails usam trim e minúsculas. Usuários inexistentes também executam a derivação para reduzir diferenças observáveis de tempo.

Sessões usam tokens aleatórios de 32 bytes; somente SHA-256 do token vai ao banco. Cookie HttpOnly, SameSite=Strict, Path=/ e duração absoluta de oito horas. Com APP_ORIGIN HTTPS, usa Secure e prefixo __Host-. HTTP só é aceito para localhost e endereços de loopback, com cookie sem Secure. Nenhum segredo é guardado em localStorage.

Cada operação consulta sessão, usuário e permissões no banco. A conta desativada não entra; sessão expirada/revogada não dá acesso. A conta com senha inicial pendente só pode consultar sua identidade, trocar senha ou sair. Não existe recuperação por e-mail, MFA ou redefinição administrativa nesta etapa; a troca pessoal exige a senha atual. Antes de disponibilização pública, definir o procedimento de recuperação de acesso da loja.

## Banco e transações

Migração `202609140003_auth` acrescenta users.mustChangePassword, unicidade de e-mail normalizado, índice de expiração, validação de duração de sessões, tabela login_throttles e permissões dos quatro perfis. Não modifica tabelas financeiras.

Alterações administrativas e criação/revogação de sessão são transacionais com auditoria. SQL é fixo no código e todos os valores externos são parâmetros; UUIDs recebem conversão explícita para Prisma/PostgreSQL. Não há exclusão de usuários. Um bloqueio no perfil ADMIN serializa alterações administrativas para preservar ao menos um administrador ativo. O bootstrap utiliza o mesmo bloqueio e recusa instalações com usuários.

## Perfis

| Perfil | Permissões |
|---|---|
| Administrador | Todas as permissões cadastradas, inclusive gestão de usuários |
| Gerente | Gestão comercial, estoque, financeiro, relatórios e aprovação de crédito; sem gestão de usuários |
| Vendedor | Criar venda e consultar produtos/clientes |
| Caixa | Receber pagamentos, operar caixa e finalizar vendas |

A tela administrativa permite criar contas, editar nome/perfil e ativar/desativar. Permissões específicas editáveis ficam para evolução posterior; novas permissões deverão ser atribuídas por migração, inclusive ao administrador.

## Rotas

| Método e rota | Acesso |
|---|---|
| POST `/api/auth/login` | Público, com validação de origem e limite de tentativas |
| POST `/api/auth/logout` | Revoga a sessão se existir; idempotente |
| GET `/api/auth/me` | Conta autenticada, inclusive senha inicial pendente |
| POST `/api/auth/password` | Conta autenticada e senha atual |
| GET `/api/users` | users.manage; até 500 contas |
| POST `/api/users` | users.manage; senha inicial com troca obrigatória |
| PATCH `/api/users/:id` | users.manage; nome, perfil e situação |

Todas as mutações exigem Origin exatamente igual a APP_ORIGIN e Content-Type application/json. Origem ausente ou diferente é recusada. Corpos acima de 8 KiB são recusados. A defesa de CSRF vale inclusive para login/logout. Respostas de API têm Cache-Control no-store. Páginas protegidas são dinâmicas e redirecionam visitantes sem sessão ao login.

## Tentativas, auditoria e operação

Cada e-mail normalizado, existente ou não, admite 10 tentativas de login em janela fixa de 15 minutos. O contador inclui sucessos para não apagar falhas concorrentes. Troca de senha possui contador separado por usuário. Resposta 429 informa a espera. No máximo quatro derivações scrypt executam simultaneamente por processo; excedentes recebem 429.

Não se confia automaticamente em X-Forwarded-For. Na implantação, acrescentar limitação por IP no proxy confiável para controlar tentativas distribuídas entre muitos e-mails. Registros de login_throttles com janela anterior a 24 horas podem ser removidos em manutenção; não são registros financeiros. Nenhuma rotina agendada foi instalada.

Auditoria registra bootstrap, criação/alteração de usuário, login, logout e troca de senha. Não inclui senha, hash ou token. Respostas de erro não expõem exceções do banco; logs técnicos usam apenas código Prisma quando disponível. Falhas de login ficam refletidas no contador; trilha detalhada e alertas de tentativas são evolução futura.

Usuário de banco da aplicação deve ser separado do usuário de migração e não ter privilégios de DDL ou de desabilitar triggers. HTTPS, segredos, backup e restauração continuam requisitos antes de produção.

## Testes e dependências

Testes cobrem hashes, CSRF, cookie HTTPS, limite de corpo, bootstrap único, normalização, credenciais inválidas, autorização, último administrador, troca inicial, revogação, expiração, limite persistente, rollback e ausência de segredos nos retornos.

O teste com Edge usa rotas de produção, Prisma e servidor PGlite temporário em loopback com uma conexão. Esse adaptador é exclusivo de teste, não autentica conexões de banco e nunca deve ser publicado. Não substitui testes concorrentes com PostgreSQL real.

deepmerge-ts foi fixado por override em 8.0.0 para corrigir GHSA-ggr8-5vv4-36mx; validar esse override ao atualizar Prisma. A revisão final de segurança permanece na etapa 12.

## Referências

- [Autenticação no Next.js](https://nextjs.org/docs/app/guides/authentication)
- [Cookies no Next.js](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [scrypt e timingSafeEqual no Node.js](https://nodejs.org/api/crypto.html)
- [Aviso deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
