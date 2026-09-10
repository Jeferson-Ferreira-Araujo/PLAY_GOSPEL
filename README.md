<div align="center">
  <img src="assets/img/avivaplay-logo.webp" alt="Avivaplay" width="360" />

  ### Jogos bíblicos pra jogar em grupo — de graça, sem cadastro, em equipes

  🔗 **[play-gospel.vercel.app](https://play-gospel.vercel.app)**
</div>

---

## O que é

O **Avivaplay** é um catálogo de mini-jogos com temas bíblicos, feito pra ser jogado **em grupo** — depois de uma reunião de ministério, num GC, num grupo pequeno, num devocional ou até num churrasco. A pessoa cria de 2 a 4 equipes, escolhe um jogo e joga; a pontuação de cada equipe é registrada durante a partida e some quando o site é fechado.

- **100% no navegador** — não tem back-end de aplicação em produção, nada de banco de dados, nada de login.
- **Sem cadastro** — o formulário de boas-vindas é totalmente opcional.
- **Site estático** hospedado na Vercel, publicado automaticamente a cada push no `main`.

> O projeto se chamava **PlayGospel** e foi renomeado para **Avivaplay** em setembro/2026. Alguns nomes internos (pasta `playgospel-ui/`, prefixos de classe CSS `pg-*`, o repositório no GitHub) ainda usam o nome antigo de propósito — não afetam o usuário.

---

## Os jogos

| Jogo | Pasta (`games/`) | Formato | Status |
|---|---|---|---|
| Verdadeiro ou Falso? | `verdadeiro-ou-falso` | Rodada | ✅ |
| Complete o Versículo | `complete-o-versiculo` | Rodada | ✅ |
| Qual a Passagem? | `qual-a-passagem` | Rodada | ✅ |
| Quem Sou Eu? | `quem-sou-eu` | Rodada | ✅ |
| Cante Uma Música | `uma-musica` | Rodada | ✅ |
| Uma Letra | `tem-na-biblia` | Rodada | ✅ |
| Emojis | `adivinhe-emoji` | Disputa | ✅ |
| Palavras Embaralhadas | `palavras-misturadas` | Disputa | ✅ |
| Quem Disse Isso? | `quem-disse-isso` | Disputa | ✅ |
| Qual é a Música? | `qual-e-a-musica` | Rodada | 🔒 Em breve |

**Formatos:**
- **Rodada** — as equipes jogam uma de cada vez, em turnos. Um indicador "Vez de..." mostra quem responde.
- **Disputa** — todas as equipes veem a mesma pergunta/desafio ao mesmo tempo; quem responder primeiro pontua.

Cada jogo é auto-contido em `games/<id>/`:

```
games/verdadeiro-ou-falso/
├── index.html      # a tela do jogo
├── game.js         # a lógica
├── game.css        # estilos específicos do jogo
├── config.json     # opções configuráveis (categoria, dificuldade, tempo)
└── data.json       # o conteúdo (perguntas/versículos/etc.) — o nome varia:
                    #   words.json, emojis.json, data.json...
```

Regras compartilhadas por todos os jogos:
- **Máximo de 10 rodadas** por partida, sorteadas aleatoriamente do pool de conteúdo.
- **Sem tela de configuração própria** — o único lugar pra configurar e começar é o modal de detalhes do jogo, no catálogo. "Jogar" cai direto na partida.
- Jogos que exigem equipes ficam **bloqueados no modal** até existirem equipes ativas.

---

## Stack

| Camada | O que é usado |
|---|---|
| Front-end | HTML + CSS + **JavaScript vanilla** (ES modules), sem framework, sem build step |
| UI | [Bootstrap 5.3](https://getbootstrap.com/) (via CDN) só para os modais + o design system próprio `playgospel-ui/` |
| Fonte | Poppins (Google Fonts) |
| Hospedagem | [Vercel](https://vercel.com) (site estático) + GitHub (deploy automático no `main`) |
| Analytics | [Vercel Web Analytics](https://vercel.com/docs/analytics) — visitas anônimas, sem cookies |
| Coleta de leads | Google Apps Script → Planilha Google privada (ver [Modal de boas-vindas](#modal-de-boas-vindas)) |
| Servidor local | `server.js` — servidor Node puro (`node:http`), só pra dev e pro editor de músicas |

**Não há bundler, transpilador nem gerenciador de dependências.** O `package.json` existe só com `"type": "module"` para o `middleware.js` da Vercel funcionar.

---

## Estrutura do repositório

```
.
├── index.html              # a home / catálogo
├── privacidade.html        # página da política de privacidade (LGPD)
├── middleware.js            # Vercel Routing Middleware — bloqueia /admin em produção
├── package.json             # só { "type": "module" }
├── server.js                # servidor de desenvolvimento (node server.js)
├── server/
│   └── songsRepository.js   # camada de dados do editor de músicas (grava songs.json)
│
├── assets/
│   ├── css/
│   │   ├── styles.css        # CSS principal da home
│   │   └── game-base.css     # base compartilhada pelos jogos "legacy"
│   ├── js/
│   │   ├── app.js            # controlador da home (catálogo, modais, equipes)
│   │   ├── teams.js          # estado das equipes (localStorage)
│   │   └── ...               # helpers de jogos específicos (piano, youtube, etc.)
│   └── img/
│       ├── avivaplay-logo.webp
│       ├── favicon.svg / favicon-96.png / apple-touch-icon.png
│       ├── og-image.png      # preview ao compartilhar (1200×630)
│       └── covers/           # capas dos jogos (WebP 500×500)
│
├── games/
│   ├── games.json           # o catálogo (lista de jogos + metadados)
│   └── <id>/                 # uma pasta por jogo (ver acima)
│
├── playgospel-ui/           # design system próprio (CSS + JS componentizados)
│   ├── css/                 # variables, buttons, badges, forms, modal, ranking...
│   ├── js/                  # core (ICONS), dropdown, modal, timer, toast...
│   └── design-system.html   # página de demonstração (não linkada no site)
│
└── admin/                   # editor de músicas do "Qual é a Música?" (só local)
    ├── index.html
    ├── js/
    └── data/songs.json      # o catálogo de músicas
```

---

## Rodando localmente

Pré-requisito: **Node 20+** (recomendado 22).

```bash
git clone https://github.com/Jeferson-Ferreira-Araujo/PLAY_GOSPEL.git
cd PLAY_GOSPEL
node server.js
```

Abre em **http://localhost:5177**. A porta pode ser trocada com `PORT=3000 node server.js`.

Qualquer servidor de arquivos estáticos também serve pra visualizar o site (ex: `npx serve`), mas o **editor de músicas** (`/admin`) precisa do `server.js`, que expõe a API `/api/songs` que grava em `admin/data/songs.json`.

> Não há testes automatizados. A verificação é feita abrindo o site no navegador (incluindo emulação de mobile/tablet).

---

## Deploy

O repositório está conectado à Vercel. **Todo push no `main` publica automaticamente** em produção — não existe pipeline de CI/CD à parte, e não é necessário.

Fluxo de trabalho: commitar direto no `main` e dar `push`. (A branch `dev` existe mas está parada.)

O `middleware.js` roda **só na Vercel** (o servidor local o ignora). Ele:
- devolve **404** para qualquer coisa em `/admin/*` (o editor de músicas não funciona em produção — a API `/api/songs` não existe lá);
- **libera `/admin/data/*`**, porque o jogo "Qual é a Música?" busca o catálogo direto do JSON estático nesse caminho.

---

## Como funciona (recursos principais)

### Equipes

Gerenciadas pelo módulo `assets/js/teams.js`, persistidas em `localStorage` (`bibflix_teams_v1`).

- **Por sessão de aba** — se o navegador é fechado e reaberto, as equipes são apagadas de propósito (outro dia = outras pessoas, começa do zero). Só somem antes disso se o usuário clicar em "Excluir equipes".
- O modal "Equipes" tem uma **visão de resumo** (equipes existentes + excluir/zerar placar) e um **assistente de 2 passos** pra criar/editar: (1) quantidade + nomes/cores/ícones + pergunta "quer sortear as pessoas?", (2) sorteio dos participantes entre as equipes.
- 15 ícones combinam com a cor da equipe; nomes têm limite de 20 caracteres e são higienizados (sem símbolos/emoji).
- A pontuação **só muda dentro dos jogos** (Acertou/Errou/etc.) — nunca pela home.

### Modais de visitante

Movidos por um único objeto em `localStorage` (`bibflix_visitor_v1`, permanente — sobrevive a fechar o navegador).

**Modal de boas-vindas** — aparece **uma vez só**, na primeira visita. Formulário opcional (nome, WhatsApp, igreja, cidade) + link pra política de privacidade. Ao fechar de qualquer jeito, marca `seen` e — se algum campo foi preenchido — envia os dados via `POST` (fire-and-forget) para um **Web App do Google Apps Script**, que adiciona uma linha numa Planilha Google privada. Um token fixo no payload (também público no JS) filtra bots genéricos.

**Modal de retorno** (`maybeShowReturnModal` em `app.js`) — pra quem já preencheu o cadastro e voltou:
- **"Bem-vindo de volta, \<nome\>"** — na primeira vez que volta num dia diferente do primeiro acesso. Uma vez só.
- **"Novidade! Adicionamos \<jogo\>"** — sempre que aparece um jogo que o visitante ainda não viu (comparado com o snapshot `knownGames`). Quem já tinha cadastro antes dessa feature ganha um snapshot silencioso pra não ser avisado dos 10 de uma vez.

### Privacidade / LGPD

`privacidade.html` descreve o que é coletado, pra quê, onde fica guardado (planilha privada, sem compartilhamento) e o direito de pedir para ver/corrigir/apagar os dados. Linkada do modal de boas-vindas e do rodapé.

### Analytics

Vercel Web Analytics carregado via `<script defer src="/_vercel/insights/script.js">` em todas as páginas. Como cada jogo tem sua própria URL, o relatório de "páginas mais acessadas" serve de proxy pra "jogos mais jogados", sem precisar de eventos customizados (que exigem plano pago).

### Layout responsivo (grade de jogos)

- **≥ 901px** (desktop + tablet deitado): 5 colunas
- **601–900px** (tablet em pé / celular deitado): 3 colunas
- **≤ 600px** (celular): 2 colunas

O rodapé é **fixo na tela a partir de 641px**, com layout adaptado no tablet em pé.

---

## Editando conteúdo

### Adicionar / editar um jogo

1. Crie `games/<novo-id>/` com `index.html`, `game.js`, `game.css` e os arquivos de dados (siga um jogo existente como molde).
2. Adicione a entrada em `games/games.json`:

   ```json
   {
     "id": "novo-id",
     "title": "Nome do Jogo",
     "description": "Descrição curta que aparece no modal de detalhes.",
     "cover": "assets/img/covers/novo-id.webp",
     "tags": ["grupo", "bíblia"],
     "route": "games/novo-id/index.html",
     "matchType": "rodada",
     "teams": { "required": true }
   }
   ```

3. Adicione a capa em `assets/img/covers/novo-id.webp` — **WebP, 500×500, qualidade ~76** (as capas antigas eram PNG de ~1,6 MB e deixavam a home lenta).

Para marcar um jogo como "Em breve", adicione `"unavailable": true` na entrada dele — a capa fica em preto-e-branco com selo "🔒 Em breve" e o jogo não abre.

### Versículos do rodapé

Adicione strings `"texto — Livro C:V"` ao array `FOOTER_VERSES` em `assets/js/app.js`. Um é sorteado a cada carregamento da página.

### Músicas ("Qual é a Música?")

Rode `node server.js` localmente e use o editor em **http://localhost:5177/admin/**. Ele grava em `admin/data/songs.json`. Depois é só commitar esse arquivo como qualquer outro — o jogo em produção lê o JSON estático direto.

---

## Design system (`playgospel-ui/`)

Uma pequena biblioteca de componentes (CSS com prefixo `.pgui-*` e JS) usada principalmente no modal de detalhes do jogo e em alguns jogos mais novos. A home carrega só os módulos "componentizados" (`variables`, `buttons`, `badges`, `forms`, `cards`, `dropdown`) — não os globais (`reset`, `typography`, `layout`), que conflitariam com o CSS da página. `playgospel-ui/design-system.html` é uma página de demonstração dos componentes, não linkada no site.

---

## Pendências

- [ ] **@ reais** das redes sociais do site (hoje `@avivaplay` placeholder no TikTok e Instagram do header)
- [ ] **Chave PIX real** no modal "Apoie esse projeto" (hoje `oferta@avivaplay.com.br` placeholder)
- [ ] **Sentry** ou similar pra rastreio de erros em produção
- [ ] Renomear o projeto na Vercel pra `avivaplay` (e atualizar as meta tags `og:url`/`og:image`)
- [ ] Lançar o jogo **"Qual é a Música?"** (remover `"unavailable": true`)

---

## Créditos

Desenvolvido por **Jeferson Araújo** — [@jefersontecinfo](https://www.instagram.com/jefersontecinfo).

O Avivaplay é e sempre será 100% gratuito.
