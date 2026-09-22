# Gincana Piaget 2026 — Confirmação e Pagamentos

Sistema independente do sorteio da Gincana, preparado para Vercel + Firebase + Checkout Integrado InfinitePay.

## O que já está implementado

### Página pública
- Apresentação da Gincana Piaget 2026.
- Data: 10/10/2026.
- Local: Clube ARJOB.
- Programação e orientações do comunicado.
- Base fechada com os 81 alunos validados do 6º ao 9º ano.
- Escolha primeiro da turma e depois busca dinâmica pelo nome.
- Permite adicionar mais de um aluno/irmão no mesmo pagamento.
- R$ 36,00 por aluno, calculado no servidor.
- Checkout InfinitePay com um item individual por aluno.
- Retorno de pagamento com validação real via `payment_check`.
- Webhook com nova validação na InfinitePay antes de confirmar.
- Após confirmação, botão para baixar as orientações da Gincana em PDF.

### Área da Secretaria (`/admin`)
- Login pelo Firebase Authentication (Email/Senha).
- Indicador de participantes confirmados: X/81 e percentual.
- Arrecadação confirmada.
- Indicadores por turma.
- Relação completa de alunos com status.
- Filtro por turma, status e busca por nome.
- Mini PDV para confirmação presencial.
- Formas presenciais: dinheiro, Pix externo, cartão na maquininha e outro.
- Possibilidade de gerar checkout InfinitePay pela própria Secretaria.
- QR Code e link do checkout quando gerado pela Secretaria.
- Relação de pedidos/pagamentos.
- Cancelamento administrativo com motivo, preservando o histórico financeiro.

## Estrutura do Firestore

- `gincana2026_participantes/{matricula}`
- `gincana2026_pagamentos/{orderNsu}`
- `gincana2026_eventos_pagamento/{evento}`

O nome do aluno não é usado como chave. A matrícula oficial é o identificador de cada participante.

## Proteção contra pagamento duplicado

Ao gerar um checkout, os alunos selecionados ficam reservados por 20 minutos. Durante esse período, outro checkout ou venda presencial para o mesmo aluno é bloqueado. Após o pagamento, o status passa para `confirmed`.

O webhook da InfinitePay não é aceito cegamente: o sistema consulta o endpoint `payment_check` e confere se o valor-base do pedido corresponde ao valor esperado antes de confirmar os alunos.

## InfinitePay

Handle configurado: `piaget`.

Valor unitário enviado para a API: `3600` centavos.

Endpoints usados:
- `POST https://api.checkout.infinitepay.io/links`
- `POST https://api.checkout.infinitepay.io/payment_check`

### Repasse das taxas

O payload do Checkout Integrado mantém o preço-base de R$ 36,00 por aluno. O repasse das taxas/parcelamento deve estar configurado no Checkout Integrado da conta InfinitePay. A documentação atual permite cartão em até 12x e Pix; o responsável escolhe a forma disponível no checkout.

Antes de colocar em produção, confirme no App/Web InfinitePay que o **Checkout Integrado está habilitado** e que a configuração de **Repasse de taxas** está ativa.

## Firebase Authentication

O painel `/admin` usa os usuários Email/Senha já cadastrados no projeto Firebase `saojoao26-fc92c`.

Em Authentication > Settings > Authorized domains, adicione o domínio final da Vercel.

## Variáveis de ambiente da Vercel

Copie `.env.example` e configure na Vercel:

- `SITE_URL`
- `INFINITEPAY_HANDLE=piaget`
- `FIREBASE_PROJECT_ID=saojoao26-fc92c`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

A chave privada deve ficar somente nas variáveis da Vercel. Não coloque o JSON de Service Account dentro do GitHub.

## Regras do Firestore

Use o arquivo `firestore.rules`. Ele preserva as regras existentes do São João e do sistema de sorteio e adiciona leitura autenticada para as três novas coleções. As gravações do sistema de pagamento acontecem pelas APIs com Firebase Admin.

## Deploy

1. Crie um repositório separado, por exemplo `gincana26-pagamentos`.
2. Envie todos os arquivos deste pacote.
3. Crie um novo projeto na Vercel apontando para o repositório.
4. Configure as variáveis de ambiente.
5. Publique as regras de `firestore.rules` no Firebase.
6. Adicione o domínio final em Firebase Authentication > Authorized domains.
7. Confira a configuração de Checkout Integrado / repasse de taxas na InfinitePay.
8. Faça um pagamento de teste e confira:
   - pedido pendente;
   - retorno do checkout;
   - webhook;
   - aluno como confirmado;
   - percentual do painel;
   - PDF de orientações.

## Observação importante sobre vendas presenciais

`Cancelar confirmação` no painel apenas cancela a participação no sistema. Essa ação **não estorna** cartão, Pix ou qualquer recebimento financeiro. O motivo fica registrado no histórico para auditoria.

## V3 — PDF pela Secretaria

- Ferramentas > **Gerar PDF de confirmação teste** gera um PDF fictício sem criar pedido ou pagamento.
- Em **Participantes**, alunos confirmados exibem as ações **PDF**, **WhatsApp** e **Cancelar**.
- **PDF** gera uma confirmação individual com as orientações da Gincana.
- **WhatsApp** abre a conversa do responsável com uma mensagem pronta. O PDF deve ser anexado manualmente por segurança do navegador.
