# Orçamentos · Marcenaria Dier

Site (e app para celular) para a **Marcenaria Dier**, de Itapajé - CE, montar orçamentos de móveis
e enviar ao cliente em PDF.

Funciona no navegador, sem servidor próprio. É só HTML, CSS e JavaScript, como o
[Otimizador de Cortes](../otimizador-de-cortes).

## Como funciona

**Preço = materiais + mão de obra + frete + instalação**

- **Materiais**: soma dos materiais de cada móvel (quantidade × preço de custo), multiplicada pela
  quantidade do móvel.
- **Mão de obra**: um percentual sobre os materiais (ex.: 100%).
- **Frete** e **instalação**: valores em reais.
- **À vista** com desconto (%) e **parcelado** em até N vezes, com ou sem juros ao mês.

## Telas

- **Orçamentos**: lista com busca e filtro por situação (pendente, aprovado, recusado,
  em produção, entregue). Cada orçamento tem número, cliente, data, projeto e vários **móveis**,
  e cada móvel tem seus materiais.
  - **Duplicar** um orçamento parecido para começar mais rápido.
  - Se um preço do catálogo mudou, o orçamento avisa e oferece **Usar preços do catálogo**.
  - Um orçamento novo deixado em branco é descartado sozinho.
- **Arquivos do orçamento**: foto do móvel pronto, PDF do plano de corte, projeto ou qualquer outro
  arquivo (até 20 MB cada). No celular dá para **tirar a foto na hora**; no computador, arrastar o
  arquivo para o cartão. Fotos grandes são reduzidas automaticamente (até 2000 px). Os arquivos ficam
  no aparelho e sobem para a nuvem (Supabase Storage); em outro aparelho, são baixados ao abrir.
  Não entram no PDF do cliente.
- **Anexar plano de corte**: no cartão "Arquivos", escolhe um projeto do
  [Otimizador de Cortes](https://gabrielfbrandao9.github.io/otimizador-de-cortes/) (salvo na nuvem,
  neste aparelho ou um `.json` exportado) e o app anexa **o mesmo PDF do botão "Baixar PDF" do
  Otimizador**: o Otimizador é aberto escondido em modo embutido (`?embed`, que não carrega nem
  salva nada) e gera o PDF. Funciona porque os dois sites ficam no mesmo endereço; precisa de
  internet. Se o Otimizador não responder, o app anexa um PDF simplificado e avisa.
- **Ocultar preços dos materiais no PDF**: chave no cartão "PDF para o cliente" de cada orçamento
  (e um padrão para orçamentos novos em Ajustes). O PDF lista os materiais e as quantidades sem
  preço unitário nem subtotal; o total de cada móvel e o resumo continuam. No app nada muda.
- **PDF para o cliente**: tudo detalhado (materiais de cada móvel linha a linha, mão de obra,
  frete, instalação, total, à vista e parcelado) com o logo, os dados da marcenaria e as
  condições de pagamento. No celular, o botão **Enviar PDF** abre o compartilhamento do Android
  (WhatsApp, e-mail…).
- **Clientes**: nome, telefone, endereço e anotações, com atalho para o WhatsApp e para criar
  um orçamento.
- **Catálogo**: materiais com o preço de custo, separados em categorias: chapas, fitas de borda,
  dobradiças, corrediças, puxadores, ferragens, fixação e colas, vidros e espelhos, iluminação,
  tintas e acabamentos, acessórios, serviços terceirizados e outros.
  **Materiais sugeridos** traz uma lista pronta de mais de 100 materiais comuns de marcenaria
  (com preços de referência para conferir); dá para escolher as categorias, e só entra o que
  ainda não está no catálogo.
  **Reajustar preços** aumenta (ou diminui) todos de uma vez, ou só uma categoria.
  Os orçamentos já feitos guardam o preço da época e não mudam.
- **Modo claro e escuro**: botão ☀/☾ no topo, ou em **Ajustes → Aparência** (Automático segue o
  tema do celular ou do computador).
- **Equipe**: em **Ajustes → Equipe**, convide outras pessoas pelo e-mail. Todos da equipe veem e
  alteram os mesmos orçamentos, clientes, materiais e ajustes; só quem convida (o dono) adiciona e
  remove pessoas. O dono vê o **último acesso** de cada pessoa; convites pendentes têm o botão
  **Avisar no WhatsApp**. Veja [SUPABASE.md](SUPABASE.md#3-equipe-mais-de-uma-conta-com-os-mesmos-dados).
- **Ajustes**: dados da marcenaria (saem no PDF), valores padrão para orçamentos novos
  (mão de obra, desconto, parcelas, juros, condições de pagamento), conta e
  **cópia de segurança** (baixar e restaurar um arquivo `.json`) e **planilha para o Excel**
  (orçamentos com os totais, materiais de cada móvel, clientes e catálogo, cada um numa aba).
- **Política de privacidade**: `privacidade.html` (link em Ajustes e na tela de entrar).

## Onde ficam os dados

Tudo é salvo **primeiro no aparelho** (funciona sem internet) e, com a conta conectada,
enviado para a **nuvem** (Supabase). Ao abrir o app em outro aparelho com a mesma conta, os dados
aparecem lá. Se o mesmo item for alterado em dois aparelhos, vale a alteração mais recente.
Numa **equipe**, os dados são de todos da equipe, e não de uma conta só.

O login e o projeto Supabase são **os mesmos do Otimizador de Cortes**. Para ligar a nuvem, é preciso
criar a tabela uma vez: veja [SUPABASE.md](SUPABASE.md).

## Aplicativo para Android

1. No celular, abra o site no **Chrome**.
2. Toque em **⋮ → Instalar app** (ou **Adicionar à tela inicial**).
3. O ícone da Marcenaria Dier aparece na tela inicial. O app abre em tela cheia e funciona sem internet.

Ao adicionar um arquivo novo ao site, inclua-o na lista `APP_FILES` do `sw.js` e aumente a `VERSION`.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.html` | Página e diálogos |
| `css/style.css` | Visual (claro e escuro, celular e computador) |
| `js/app.js` | Telas e interação |
| `js/calc.js` | Cálculo do orçamento |
| `js/pdf.js` | Geração do PDF (jsPDF + AutoTable) |
| `js/files.js` | Arquivos dos orçamentos (aparelho e Supabase Storage) |
| `js/plano.js` | PDF do plano de corte do Otimizador, para anexar |
| `js/store.js` | Dados no aparelho e sincronização com a nuvem |
| `js/cloud.js` | Login e acesso ao Supabase |
| `js/logo.js` | Logo (usado no topo e no PDF) |
| `js/config.js` | Endereço e chave pública do Supabase |
| `supabase/schema.sql` | Tabelas, equipe, bucket de arquivos e regras de segurança no Supabase |
| `sw.js`, `manifest.webmanifest`, `icons/` | App instalável e funcionamento offline |

## Testar no computador

```bash
python -m http.server 8766
```

Depois acesse http://localhost:8766.

## Publicar no GitHub Pages

1. Crie um repositório vazio no GitHub chamado `orcamento-marcenaria`.
2. Nesta pasta, rode:

   ```bash
   git remote add origin https://github.com/gabrielfbrandao9/orcamento-marcenaria.git
   git push -u origin main
   ```

3. No GitHub: **Settings → Pages → Branch: main / (root) → Save**.
4. Em alguns minutos o site fica em `https://gabrielfbrandao9.github.io/orcamento-marcenaria/`.
