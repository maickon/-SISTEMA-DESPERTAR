# -SISTEMA-DESPERTAR

**DESPERTAR** é um RPG de mesa d20, sem classes e sem raças, inspirado em *Solo Leveling*. O livro e as ferramentas do jogo são um site HTML. Obra de fã, sem fins lucrativos.

## Como usar

Abra `index.html` no navegador. O site funciona offline e não precisa de instalação.

- **Livro:** regras completas em 13 capítulos, com botão para imprimir ou salvar em PDF.
- **Árvores:** 10 árvores com 80 habilidades. Mostra pré-requisitos e permite comprar habilidades para a ficha.
- **Sorteios:** atributos, Despertar (d100), Avaliação do Sistema, subida de nível, gerador de itens, gerador de Portais e rolador de dados.
- **Ficha:** cálculo automático, várias fichas salvas no navegador, exportação e importação em JSON e impressão.

## Estrutura

```
index.html      livro e interface
css/style.css   visual (tela e impressão)
js/data.js      dados: habilidades, despertares, itens, portais, ameaças
js/app.js       lógica das ferramentas
```

Para acrescentar habilidades, Despertares ou afixos, edite `js/data.js`. O livro e as ferramentas se atualizam sozinhos.
