# Ligar a nuvem (Supabase)

O app de orçamentos usa **o mesmo projeto Supabase do Otimizador de Cortes**: mesmo login
(Google ou e-mail) e mesma chave, que já estão em [`js/config.js`](js/config.js).
Falta só criar a tabela onde ficam orçamentos, clientes e materiais, e liberar o endereço do site.

Sem isso o app funciona normalmente, mas salva só no aparelho (aparece **"Nuvem não configurada"** no topo).

## 1. Criar a tabela

1. Entre em <https://supabase.com> e abra o projeto do Otimizador de Cortes.
2. No menu lateral, abra **SQL Editor** → **New query**.
3. Copie todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql), cole e clique em **Run**.
4. Deve aparecer *Success. No rows returned*.

O script cria a tabela `orcamento_registros` e as **regras de segurança (RLS)**: cada conta só lê
e altera os próprios dados. A tabela `projects` do Otimizador não é alterada.

## 2. Liberar o endereço do site

Em **Authentication** → **URL Configuration** → **Redirect URLs**, adicione:

- `https://gabrielfbrandao9.github.io/orcamento-marcenaria/**`
- `http://localhost:8766/**`, para testar no computador.

Não mude o **Site URL** (continua sendo o do Otimizador).

Pronto. Ao entrar na conta, os dados que já estavam no aparelho sobem para a nuvem automaticamente.

## Coisas boas de saber

- **Login compartilhado**: como os dois sites ficam no mesmo endereço (`gabrielfbrandao9.github.io`),
  quem entrou no Otimizador já aparece conectado nos Orçamentos, e vice-versa.
- **Tela do Google**: ao entrar com Google, a tela de permissão mostra o nome cadastrado no
  Google Cloud ("Otimizador de Cortes"). Se quiser, mude para um nome geral em
  *Google Cloud Console → Tela de consentimento OAuth*.
- **Projeto pausado**: no plano gratuito, o Supabase pausa o projeto depois de 1 semana sem acesso.
  Como seu pai vai usar o app com frequência, isso dificilmente acontece. Se acontecer, entre no
  painel e clique em **Restore**. Os dados não se perdem.
- **Ver os dados**: em **Table Editor** → `orcamento_registros`. A coluna `tipo` diz se é material,
  cliente, orçamento ou configuração; o conteúdo fica em `dados`.
- **Cópia de segurança**: além da nuvem, em **Ajustes → Baixar cópia** dá para guardar tudo num arquivo.
