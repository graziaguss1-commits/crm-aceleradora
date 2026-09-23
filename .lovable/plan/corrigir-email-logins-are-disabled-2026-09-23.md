# Corrigir "Email logins are disabled"

## O que está acontecendo

Ao tentar criar conta ou entrar, o servidor responde com "Email signups are disabled" / "Email logins are disabled". Isso não é um erro do código da tela de login: o método de acesso por email e senha está desligado no backend do projeto, então qualquer tentativa é recusada antes de chegar ao app.

## Correção

1. Ativar o acesso por email e senha no backend do projeto.
2. Manter a confirmação de email no padrão atual (não vou ligar confirmação automática sem você pedir).
3. Testar o cadastro e o login com um email real para confirmar que a mensagem de erro desaparece.

## Observações

- Nenhuma alteração de código é necessária; a tela de login continua igual.
- Uma senha usada antes falhou por ser considerada fraca/vazada ("Isabelle1"). Use uma senha mais forte no cadastro.
- Se você quiser entrar sem precisar confirmar o email, me avise e eu ativo a confirmação automática.
