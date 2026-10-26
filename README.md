# Coroinhas

Sistema web para a coordenação da pastoral de coroinhas. Reúne cadastro, escalas litúrgicas, presenças, rifas por blocos, arrecadações, agenda e permissões em um monorepo com frontend e backend separados.

## Stack

- React, TypeScript e Vite
- Node.js, TypeScript e Fastify
- PostgreSQL e Prisma
- pnpm e Turborepo
- Tailwind CSS, componentes no padrão shadcn/ui e Lucide
- React Hook Form, Zod, TanStack Query, React Router e Recharts
- Vitest e Playwright
- Docker Compose para o PostgreSQL

## Módulos

1. Visão geral, com indicadores lidos do banco.
2. Coroinhas, com arquivamento e histórico.
3. Escalas, com as oito funções litúrgicas, rascunho, publicação, impressão, PDF e CSV.
4. Presença integrada à escala.
5. Rifas por blocos e quantidades.
6. Arrecadações, lançamentos e participantes únicos.
7. Agenda e reuniões.
8. Usuários, perfis e permissões.
9. Relatórios e configurações.

## Perfis

- **Administrador:** acesso total, usuários, permissões e configurações.
- **Coordenador:** coroinhas, escalas, presenças, rifas, arrecadações, agenda e relatórios.
- **Secretário:** cadastros, escalas, presenças, agenda e relatórios desses módulos. O administrador pode ampliar as permissões.

As regras são verificadas na API. A interface só mostra as ações permitidas.

## Requisitos

- Node.js 22 ou superior
- pnpm 10
- Docker, para o banco oficial, ou o PostgreSQL local descrito abaixo

## Instalação

```bash
pnpm install
cp .env.example .env
```

No Windows, copie o arquivo com `Copy-Item .env.example .env`.

Edite `.env` e defina:

- `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET`, com pelo menos 16 caracteres aleatórios;
- `ADMIN_EMAIL`;
- `ADMIN_PASSWORD`, com pelo menos 10 caracteres, letras e números.

Não existe senha padrão no código. Se essas variáveis não forem definidas, o sistema sobe sem criar administrador.

### Banco com Docker

```bash
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

O PostgreSQL fica em `localhost:5432`, com usuário, senha e banco `coroinha`. Essa senha é apenas do ambiente local. Troque-a se o servidor for compartilhado.

### Banco sem Docker

Se o Docker não estiver disponível, um PostgreSQL portátil pode ser iniciado na pasta do projeto:

```bash
pnpm db:local
```

Esse comando sobe o PostgreSQL na porta **5433**. Ajuste `DATABASE_URL` para `postgresql://coroinha:coroinha@127.0.0.1:5433/coroinha`. Deixe o comando aberto e, em outro terminal, execute as migrações, o seed e o desenvolvimento.

## Uso

- Interface: http://localhost:5173
- API: http://localhost:3333/api/health

O primeiro acesso usa o e-mail e a senha definidos no `.env`. Depois disso, o administrador cadastra coordenadores e secretários. Nenhum usuário altera o próprio perfil.

## Scripts

| Comando | Função |
| --- | --- |
| `pnpm dev` | API e interface em modo de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm typecheck` | Verificação de tipos |
| `pnpm lint` | Qualidade de código |
| `pnpm test` | Testes de domínio e integração da API |
| `pnpm test:e2e` | Fluxos de ponta a ponta com Playwright |
| `pnpm db:migrate` | Aplica as migrações |
| `pnpm db:seed` | Garante as configurações e o administrador inicial |

Os testes de integração usam o banco `coroinha_test` no mesmo PostgreSQL. Crie-o antes, ou use `pnpm db:local`, que cria os dois bancos.

## Produção com Docker

No VPS da paróquia o banco continua no Postgres que já está no ar (`www-postgres-1`, rede `www_default`). O Turborepo entra em um único container, que serve a API e a interface:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

O `.env.production` fica só no servidor. `DATABASE_URL` aponta para `www-postgres-1`, no banco `coroinha`. Use `COOKIE_SECURE=true` atrás de HTTPS. Em HTTP local, mantenha `false`.

O compose da raiz, com o serviço `db`, é apenas para desenvolvimento nesta máquina.

## Segurança e privacidade

- Senhas com bcrypt e política mínima.
- Sessão renovada por cookie `httpOnly` e acesso por token de curta duração.
- Permissões conferidas no backend.
- Auditoria das ações administrativas.
- Arquivamento em vez de exclusão do histórico.
- Valores financeiros em decimal.
- Dados pessoais visíveis apenas para usuários autenticados e autorizados.

## Testes de ponta a ponta

Com a API, a interface e o banco no ar:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```
