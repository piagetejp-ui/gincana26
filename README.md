# Gincana Piaget 2026 — Sistema de Chamada e Roleta

Sistema preparado para substituir o front-end antigo do São João no repositório `piagetejp-ui/gincana26`.

## Base validada

- 81 alunos ativos
- Equipe Azul: 41
- Equipe Laranja: 40
- 6º ao 9º Ano

## Funcionamento

1. Login obrigatório pelo Firebase Authentication (E-mail/Senha).
2. Chamada visual de um aluno ainda não chamado.
3. A ordem dos alunos varia para reduzir repetições de turma e padrões muito óbvios entre equipes.
4. Roleta visual com 8 fatias: 4 azuis e 4 laranjas.
5. A roleta sempre termina em uma fatia da equipe previamente definida para o aluno.
6. Resultado é salvo em `gincana2026/state` no Firestore e espelhado no `localStorage`.
7. A relação oficial pode ser aberta e impressa.

## Reset para testes

O reset possui várias camadas de proteção:

- fica em uma área discreta do painel lateral;
- exige marcar uma confirmação;
- exige digitar exatamente `RESETAR GINCANA`;
- exige a senha atual do usuário autenticado;
- faz reautenticação no Firebase;
- exige uma espera final de 5 segundos;
- cria backup automático antes de zerar em `gincana2026/backup_latest` e no navegador.

## Regras do Firestore

Publique o conteúdo de `firestore.rules` no Firebase Console. Ele preserva a coleção antiga do São João e libera a Gincana apenas para usuários autenticados.

## Firebase Authentication

O projeto já usa o Firebase `saojoao26-fc92c`. Mantenha `Authentication > Sign-in method > Email/Password` ativado e use um usuário já cadastrado.

## Publicação no GitHub/Vercel

Para transformar o repositório antigo em Gincana, deixe estes arquivos/pastas na raiz:

- `index.html`
- `package.json`
- `vite.config.js`
- `src/`
- `README.md`

Os arquivos antigos `comprar.html`, `obrigado.html` e `api/` não são usados pela Gincana e podem ser removidos do repositório para uma implantação limpa.

### Vercel

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

O Vercel normalmente detecta Vite automaticamente.

## Teste rápido antes do evento

1. Entre no sistema.
2. Faça 3 a 5 chamadas completas, incluindo a roleta.
3. Atualize a página e confirme que o progresso continua.
4. Teste em tela cheia.
5. Use o reset protegido e confirme que volta para 0/81.
6. Faça uma última atualização da página e confirme 0/81 antes do sorteio oficial.

## RC2 — correções de apresentação
- Corrigida a animação da roleta: o componente não é mais remontado ao iniciar o giro, permitindo a transição visual completa de 4,65 s.
- Removido o atalho público **Equipes**.
- A relação completa das equipes agora fica exclusivamente na **Área protegida**, que exige nova confirmação da senha do usuário autenticado.
- O reset permanece com confirmação reforçada (frase + senha + contagem regressiva) e backup automático.
- O painel público não mostra mais os totais finais por equipe; exibe apenas participantes e quantidade restante.
