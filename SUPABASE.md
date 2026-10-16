# Ligar a nuvem (Supabase)

O app de orçamentos usa **o mesmo projeto Supabase do Otimizador de Cortes**: mesmo login
(Google ou e-mail) e mesma chave, que já estão em [`js/config.js`](js/config.js).
Falta só criar a tabela onde ficam orçamentos, clientes e materiais, o espaço dos arquivos (fotos, PDFs)
e liberar o endereço do site.

Sem isso o app funciona normalmente, mas salva só no aparelho (aparece **"Nuvem não configurada"** no topo).

## 1. Criar a tabela e o espaço dos arquivos

1. Entre em <https://supabase.com> e abra o projeto do Otimizador de Cortes.
2. No menu lateral, abra **SQL Editor** → **New query**.
3. Copie todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql), cole e clique em **Run**.
4. Deve aparecer *Success. No rows returned*.

O script cria a tabela `orcamento_registros`, as tabelas da **equipe** (`equipes`, `equipe_membros`
e `equipe_convites`), o bucket `orcamento-anexos` (onde ficam as fotos e PDFs dos orçamentos, até
20 MB cada) e as **regras de segurança**: cada conta só lê e altera os dados e arquivos da própria
equipe (ou só os seus, se não estiver em equipe). A tabela `projects` do Otimizador não é alterada.

> **Já tinha rodado o script antes?** Rode de novo o arquivo inteiro: ele foi atualizado para a
> equipe e pode ser executado quantas vezes precisar, sem apagar nada. Os dados que já existem
> continuam com quem os criou. Enquanto o script novo não for rodado, o app funciona normalmente,
> só sem a equipe (em **Ajustes → Equipe** aparece um aviso).

## 2. Liberar o endereço do site

Em **Authentication** → **URL Configuration** → **Redirect URLs**, adicione:

- `https://gabrielfbrandao9.github.io/orcamento-marcenaria/**`
- `http://localhost:8766/**`, para testar no computador.

Não mude o **Site URL** (continua sendo o do Otimizador).

Pronto. Ao entrar na conta, os dados que já estavam no aparelho sobem para a nuvem automaticamente.

## 3. Equipe (mais de uma conta com os mesmos dados)

Em **Ajustes → Equipe**, quem já tem os dados digita o e-mail da outra pessoa e toca em **Convidar**.
Não chega e-mail nenhum: avise a pessoa (o botão **Avisar no WhatsApp** manda o link do app). Ela entra
no app **com aquele e-mail** (Google ou link por e-mail) e vê o convite no topo da tela.

- **Quem convida vira o dono.** Todos da equipe criam, alteram e excluem orçamentos, clientes,
  materiais e ajustes. Só o dono convida e remove pessoas.
- **Ao aceitar**, se a pessoa já tinha dados, o app pergunta se ela leva os dados para a equipe ou
  começa só com os da equipe. Os ajustes dela nunca vão: valem os da equipe. Os arquivos levados
  passam para a pasta da equipe automaticamente, pelo aparelho de quem os trouxe (precisa de
  internet); até isso acontecer, só essa pessoa consegue abri-los.
- **Cada conta está em uma equipe só.** Quem sai ou é removido volta para os próprios dados; o que
  fez na equipe continua na equipe.
- **Duas pessoas mexendo no mesmo orçamento ao mesmo tempo:** vale a última alteração salva. As
  alterações de outra pessoa aparecem ao abrir o app, ao voltar para ele ou a cada minuto e meio.
- **Números dos orçamentos:** cada aparelho usa o maior número que conhece + 1. Se duas pessoas
  criarem orçamentos sem internet ao mesmo tempo, os dois podem sair com o mesmo número.
- **O dono não pode sair** enquanto houver outras pessoas na equipe. Se a conta do dono for apagada
  no Supabase, a equipe deixa de existir e os outros voltam para os próprios dados.

## Coisas boas de saber

- **Login compartilhado**: como os dois sites ficam no mesmo endereço (`gabrielfbrandao9.github.io`),
  quem entrou no Otimizador já aparece conectado nos Orçamentos, e vice-versa.
- **Tela do Google**: ao entrar com Google, a tela de permissão mostra o nome cadastrado no
  Google Cloud ("Otimizador de Cortes"). Se quiser, mude para um nome geral em
  *Google Cloud Console → Tela de consentimento OAuth*.
- **Projeto pausado**: no plano gratuito, o Supabase pausa o projeto depois de 1 semana sem acesso.
  Como seu pai vai usar o app com frequência, isso dificilmente acontece. Se acontecer, entre no
  painel e clique em **Restore**. Os dados não se perdem.
- **Espaço dos arquivos**: o plano gratuito tem 1 GB. Com as fotos reduzidas pelo app (uns 300 a
  600 KB cada), cabem milhares de fotos. Para ver os arquivos: **Storage** → `orcamento-anexos`.
- **Ver os dados**: em **Table Editor** → `orcamento_registros`. A coluna `tipo` diz se é material,
  cliente, orçamento, anexo ou configuração; o conteúdo fica em `dados`; `equipe_id` diz de qual
  equipe (ou conta) é, e `user_id`, quem criou.
- **Cópia de segurança**: além da nuvem, em **Ajustes → Baixar cópia** dá para guardar os dados num
  arquivo (orçamentos, clientes e materiais; as fotos e PDFs anexados ficam na nuvem, não vão no arquivo).
