# Deploy de homologação do VitDoor na VPS

Este procedimento disponibiliza o painel web, a API, PostgreSQL e o player web de simulação. Ele ainda não representa uma implantação comercial: o player oficial Android, tokens individuais de dispositivo, R2/CDN, Redis, TLS e backups externos continuam pendentes.

## 1. Pré-requisitos

- VPS Linux com pelo menos 2 vCPU, 4 GB de RAM e disco SSD.
- Docker Engine e Docker Compose Plugin instalados.
- Portas TCP 22 e 80 liberadas durante a homologação com Cloudflare Flexible.
- Repositório copiado ou clonado na VPS.

A porta 5432 não deve ser aberta no firewall. O PostgreSQL existe somente na rede interna dos containers.

## 2. Configuração

Na raiz do projeto:

```bash
cp .env.production.example .env
```

Edite `.env` e substitua obrigatoriamente:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `PUBLIC_BASE_URL` pelo IP público, temporariamente
- `CORS_ORIGINS` pelo IP público nas portas 80 e 8081
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`

Gere segredos diferentes e longos. O arquivo `.env` não deve ser versionado nem enviado por mensagem.

## 3. Subir a aplicação

```bash
docker network inspect vitdoor_network >/dev/null 2>&1 || docker network create vitdoor_network
docker compose build
docker compose up -d
docker compose ps
```

O serviço `migrate` executa as migrações antes da API. Depois crie o primeiro administrador:

```bash
docker compose run --rm backend node dist/scripts/seedAdmin.js
```

O comando é idempotente: quando executado novamente, atualiza a senha do administrador configurado no `.env`.

## 4. Testes iniciais

- Painel: `https://app.vitdoor.com.br/`
- Healthcheck: `http://IP_DA_VPS/api/health`
- Simulador web: `https://player.vitdoor.com.br/`

Resposta esperada do healthcheck:

```json
{"status":"OK","database":"OK"}
```

Verifique os logs:

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 admin
docker compose logs --tail=100 player-simulator
```

Teste nesta ordem: login master, criação de cliente, login do cliente, upload, playlist, layout, pareamento, reprodução no simulador, sincronização e screenshot.

## 5. Persistência e atualização

Os dados são mantidos nos volumes `postgres_data` e `uploads_data`. Recriar containers não remove os volumes.

Para atualizar:

```bash
git pull
docker compose build
docker compose up -d
```

Não execute `docker compose down -v`: a opção `-v` remove banco e uploads.

Antes de qualquer atualização relevante, faça ao menos um dump manual:

```bash
docker compose exec -T postgres pg_dump -U vitdoor vitdoor > vitdoor-backup.sql
```

O dump local ainda não atende o requisito de backup externo da arquitetura.

## 6. Limitações desta homologação

- Upload ainda passa pela memória da API e fica no volume local da VPS.
- O player na porta 8081 é apenas simulador web.
- Comunicação de dispositivo ainda não usa credencial individual revogável.
- WebSocket não persiste comandos e funciona em uma única instância.
- Não há TLS; evite credenciais ou conteúdo real até ativar HTTPS.
- Não há Redis, R2/CDN, multipart, manifesto imutável ou cache Android.
- Proof-of-play do simulador ainda não possui autenticação de dispositivo.

Quando o DNS estiver pronto, o passo seguinte será colocar HTTPS na origem, conectar a Cloudflare, restringir portas públicas e ativar R2/CDN.
