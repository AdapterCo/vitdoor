# Deploy de homologação do VitDoor na VPS

Este procedimento disponibiliza o painel web, a API, PostgreSQL, R2/CDN e o player web de simulação. Ele ainda não representa uma implantação comercial: o player oficial Android, Redis, upload multipart, manifestos versionados e backups externos continuam pendentes.

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

Validação do roteamento dos subdomínios:

```bash
curl -sI https://app.vitdoor.com.br/ | grep -i x-vitdoor-frontend
curl -sI https://player.vitdoor.com.br/ | grep -i x-vitdoor-frontend
```

O primeiro deve retornar `admin-panel` e o segundo `player`. Se uma VPS estiver com imagens antigas ou invertidas, reconstrua sem cache:

```bash
docker compose build --no-cache admin player-simulator gateway
docker compose up -d --force-recreate admin player-simulator gateway
```

Resposta esperada do healthcheck:

```json
{"status":"OK","database":"OK"}
```

## Cloudflare R2 e CDN de mídias

1. No Cloudflare, abra **R2 Object Storage** e crie o bucket `vitdoor-media` na localização automática.
2. No bucket, abra **Settings > Custom Domains > Add** e conecte `media.vitdoor.com.br`. Aguarde os estados de domínio e SSL ficarem ativos.
3. Mantenha o endereço público `r2.dev` desativado. O acesso público deve ocorrer somente pelo domínio personalizado.
4. Em **R2 > Manage API Tokens**, crie um token de conta com permissão **Object Read & Write**, limitado somente ao bucket `vitdoor-media`. Guarde o Access Key ID e o Secret Access Key; o segredo só é exibido uma vez.
5. Em **Settings > CORS Policy**, aplique:

```json
[
  {
    "AllowedOrigins": [
      "https://app.vitdoor.com.br",
      "https://player.vitdoor.com.br"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Accept-Ranges", "Content-Length", "Content-Range", "ETag", "cf-cache-status"],
    "MaxAgeSeconds": 3600
  }
]
```

6. Em **Caching > Cache Rules**, crie `VitDoor R2 Media`: hostname igual a `media.vitdoor.com.br`, elegível para cache, Edge TTL respeitando o `Cache-Control` da origem. Os objetos novos recebem `public, max-age=31536000, immutable` e nunca são sobrescritos.
7. Em **Caching > Tiered Cache**, ative Smart Tiered Cache para reduzir leituras repetidas no R2.
8. Preencha no `/opt/vitdoor/.env`:

```ini
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=SEU_ACCOUNT_ID
R2_ACCESS_KEY_ID=SEU_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=SEU_SECRET_ACCESS_KEY
R2_BUCKET_NAME=vitdoor-media
R2_PUBLIC_URL=https://media.vitdoor.com.br
```

Não coloque aspas, espaços ou as credenciais no Git. Depois recrie somente backend e migração:

```bash
docker compose build backend migrate
docker compose up -d --force-recreate backend
docker compose restart gateway
docker compose logs --tail=100 backend
curl -s https://app.vitdoor.com.br/api/health
```

O healthcheck deve informar `"storage":"r2"`. Faça um upload pequeno pelo painel e copie a URL retornada pela API/biblioteca. Ela deve começar com `https://media.vitdoor.com.br/tenants/`. Valide o CDN duas vezes:

```bash
curl -sI 'URL_DA_MIDIA'
curl -sI 'URL_DA_MIDIA'
```

Confira `cache-control: public, max-age=31536000, immutable` e `cf-cache-status`. O primeiro acesso pode ser `MISS` ou `DYNAMIC` enquanto a regra propaga; os seguintes devem chegar a `HIT` quando elegíveis.

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
- Dispositivos usam credencial individual revogável; falta portar e validar o fluxo no aplicativo Android oficial.
- WebSocket não persiste comandos e funciona em uma única instância.
- O navegador já usa HTTPS na borda Cloudflare, mas ainda falta TLS entre Cloudflare e a origem para usar o modo Full (strict).
- R2/CDN está operacional; ainda não há Redis, upload direto/multipart, manifesto imutável ou cache Android.
- Proof-of-play exige autenticação do dispositivo; a fila offline definitiva ainda depende do Android/Room.

As próximas frentes são manifesto/checksum, upload direto/multipart, restrição da origem aos IPs da Cloudflare, backups e o aplicativo Android.
