# Gincana Piaget 2026 — RC5 PDF Oficial

Sistema de chamada e apresentação das equipes da Gincana 2026 da Escola Piaget.

## Base
- 81 alunos ativos
- 41 integrantes cadastrados na Equipe Azul
- 40 integrantes cadastrados na Equipe Laranja
- Chamada sem repetição
- Roleta visual com 8 fatias

## Firebase
Projeto: `saojoao26-fc92c`

A coleção usada é `gincana2026`.

Documentos principais:
- `state`: estado corrente da sessão
- `audit_<sessao>_<ordem>`: registro individual de auditoria de cada sorteio
- `backup_<sessao>`: backup de uma sessão encerrada por reset
- `backup_latest`: último backup

## Área protegida
A área administrativa exige reautenticação por senha e reúne:
1. Auditoria do sorteio.
2. Resultado oficial.
3. Divisão oficial cadastrada.
4. Reset protegido.

## RC5 — impressão e PDFs oficiais
A alteração desta versão é restrita à estrutura de impressão/PDF. A lógica do sorteio e do Firebase permanece a mesma da RC4.

### Correção da impressão
A impressão não usa mais `window.open`, evitando bloqueio de pop-up. O documento é preparado em um iframe interno e abre diretamente o diálogo do navegador para **Imprimir / Salvar como PDF**.

### Resultado oficial
- 2 páginas A4 retrato, uma por equipe.
- Equipe Azul e Equipe Laranja com identidade visual própria.
- Ordem dentro da equipe, ordem geral do sorteio, horário com segundos, nome completo e turma.
- Sessão, início, conclusão e quantidade de integrantes no cabeçalho.
- Logomarca e identificação institucional.
- Formato pensado para impressão e exposição em mural.

### Auditoria oficial
- 2 páginas A4 retrato.
- 81 registros em ordem cronológica.
- Ordem, horário, aluno, turma e equipe.
- Equipes destacadas discretamente por cor.
- Cabeçalho repetido em cada página e paginação no rodapé.

### Divisão oficial cadastrada
- 2 páginas A4 retrato, uma por equipe.
- Organização por turma.
- Layout compacto, sem sobreposições e com todos os 81 alunos.

## Verificação visual
Os três modelos foram renderizados em A4 com a base completa (41 Azul / 40 Laranja). Resultado: 2 páginas para cada relatório, sem textos cortados, sem sobreposição com rodapé e sem quebra de nomes para fora das tabelas.

## Execução
```bash
npm install
npm run dev
```

Build:
```bash
npm run build
```
