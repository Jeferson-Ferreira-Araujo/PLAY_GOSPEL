# Fontes — self-host pendente

Esta pasta está vazia de propósito: não há como gerar/baixar os arquivos
binários (`.woff2`) do Poppins/Inter automaticamente aqui.

Por padrão, o **PlayGospel UI** conta com a fonte sendo carregada via
`<link>` do Google Fonts na página que consome a biblioteca (é o que
`design-system.html` faz, no mesmo padrão do restante do site
PlayGospel).

## Para self-host de verdade

1. Baixe os pesos usados (400, 500, 600, 700, 800) em formato `.woff2`:
   - Poppins: https://fonts.google.com/specimen/Poppins
   - Inter: https://fonts.google.com/specimen/Inter
2. Coloque os arquivos aqui, por exemplo:
   ```
   fonts/Poppins-Regular.woff2
   fonts/Poppins-Medium.woff2
   fonts/Poppins-SemiBold.woff2
   fonts/Poppins-Bold.woff2
   fonts/Poppins-ExtraBold.woff2
   fonts/Inter-Regular.woff2
   ```
3. Descomente o bloco `@font-face` já escrito no topo de `css/typography.css`.
4. Remova o `<link>` do Google Fonts das páginas que usarem a biblioteca.
