# -SISTEMA-DESPERTAR

**DESPERTAR** é um RPG de mesa d20, sem classes e sem raças, inspirado em *Solo Leveling*. O livro e as ferramentas do jogo são um site HTML. Obra de fã, sem fins lucrativos.

## Como usar

Abra `index.html` no navegador, ou acesse https://maickon.github.io/-SISTEMA-DESPERTAR/ e toque em **📲 Instalar** para usar como aplicativo no Android, no iPhone ou no computador (funciona sem internet depois da primeira visita).

- **Livro:** regras completas em 14 capítulos, escritas para quem vem do D&D 3.5, com botão para imprimir ou salvar em PDF.
- **Ficha:** cálculo automático, várias fichas salvas no navegador (IndexedDB), ajuda "?" em cada campo, guia de criação, histórico com desfazer, sorteios com a opção de rolar no site ou informar o dado da mesa, Refino e Ascensão de itens, limites de mãos e inventário.
- **Árvores:** 10 árvores com 85 habilidades. Mostra pré-requisitos e permite comprar habilidades para a ficha.
- **Mestre:** gerador de Portais, encontros, saque e rolador de dados.
- **Compartilhar:** itens, fichas e pacotes de recompensa viajam dentro de um link (sem servidor). Também dá para mandar pelo WhatsApp, pelo Telegram ou por um bot do Telegram configurado pelo Mestre (a chave do bot fica só no navegador dele).

## Estrutura

```
index.html      livro e interface
css/style.css   visual (tela e impressão)
js/data.js      dados: habilidades, despertares, itens, portais, ameaças
js/app.js       lógica das ferramentas
```

Para acrescentar habilidades, Despertares ou afixos, edite `js/data.js`. O livro e as ferramentas se atualizam sozinhos.
