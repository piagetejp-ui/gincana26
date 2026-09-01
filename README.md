# Gincana 2026 — Escola Piaget

Sistema de chamada de alunos e roleta de equipes para a Gincana 2026.

## Base cadastrada
- 81 alunos ativos
- Equipe Azul: 41
- Equipe Laranja: 40
- Ordem de chamada: aleatória com pequenas regras para evitar sequências artificiais
- Resultado da roleta: sempre respeita a equipe previamente cadastrada
- Roleta: 8 fatias (4 azuis + 4 laranjas) em padrão não alternado

## Rodar localmente
```bash
npm install
npm run dev
```

## Firebase
Esta versão já está configurada para o projeto Firebase `saojoao26-fc92c`.

O sistema usa somente:
- coleção: `gincana2026`
- documento: `state`

Não é necessário apagar as coleções do sistema antigo do São João.

### Regras do Firestore
Preserve as regras que já existem e acrescente um bloco para `gincana2026`.
Para teste interno simples:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /gincana2026/{document} {
      allow read, write: if true;
    }
  }
}
```

> Se as regras antigas já tiverem outros `match`, não substitua tudo pelo exemplo acima: adicione apenas o bloco `match /gincana2026/{document}` dentro de `match /databases/{database}/documents`.

## Vercel
Projeto Vite padrão.
- Build command: `npm run build`
- Output directory: `dist`

Se a Vercel já estiver ligada ao repositório GitHub antigo, substituir os arquivos do repositório por estes e fazer push normalmente dispara um novo deploy.

## Atalhos no evento
- `Espaço`: chama o próximo aluno / gira a roleta
- `F`: tela cheia

## Antes do evento
1. Fazer um deploy de teste.
2. Conferir se dois navegadores/dispositivos acompanham o mesmo andamento pelo Firestore.
3. Fazer um sorteio completo de ensaio e depois usar “Reiniciar” antes do evento oficial.
4. Manter apenas uma tela/operador comandando o sorteio durante o evento.
