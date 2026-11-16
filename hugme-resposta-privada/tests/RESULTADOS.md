# Resultado dos testes automatizados

Gerado por `node tests/run-tests.cjs` em 2026-11-16T22:48:17.723Z. Nenhuma mensagem real foi enviada: o HugMe é a página simulada `tests/mock-hugme.html`.

| Resultado | Teste |
|---|---|
| OK | Instalador: link javascript: e instalação manual decodificam para o mesmo código |
| OK | Os quatro JS Paths são idênticos aos do mapa (após desfazer só o escape da camada JS) |
| OK | Modelo da mensagem no código = docs/mensagem-modelo.txt (literal) |
| OK | Mensagem: um telefone; especialista igual na saudação e na assinatura |
| OK | Mensagem: dois telefones com ";" na mesma frase, ordem e separador preservados |
| OK | Mensagem: valores com "$" não alteram o texto (sem padrões de substituição) |
| OK | checkMessage aponta divergência fora dos placeholders |
| OK | Planilha de casos: cabeçalho na linha 4, grafias encontradas e vínculo pela letra |
| OK | Planilha de casos: colunas intermediárias vazias, telefone numérico com zero à esquerda, linhas incompletas/duplicadas |
| OK | Tags ambígua: não escolhe a primeira; operador escolhe e a mensagem usa o nome nas duas posições |
| OK | Tags vazia: linha fica em revisão (não incompleta) e não inventa especialista |
| OK | Lista de especialistas: nomes marcados preenchem as linhas sem Tags em rodízio; Tags preenchida é mantida |
| OK | Escolha por linha a partir da lista (✎) e "Voltar ao automático" |
| OK | "Usar os marcados em todas as linhas" substitui também as linhas com Tags |
| OK | Painel arrastável pela barra superior (posição salva) |
| OK | Simulação: percorre a fila até o passo #4 sem clicar em "Responder privado" |
| OK | Envio (simulado no mock): um clique por ticket, texto do ng-model = modelo literal, dois telefones numa mensagem |
| OK | Troca de ticket em andamento: espera o conteúdo novo, nunca age no ticket anterior |
| OK | Ticket divergente: diagnóstico com linha, id e passo; nada é clicado; pular segue a fila |
| OK | Sem confirmação após o clique final: "Verificar envio", fila pausada e sem reenvio automático |
| OK | Editor de texto rico (tiqt.message em HTML): mensagem literal com quebras de linha, dois telefones |
| OK | Trava "Parar antes de enviar" (textarea, modo Envio real): prepara o 1º ticket, destaca o botão e encerra sem clicar |
| OK | Trava "Parar antes de enviar" (rich, modo Envio real): prepara o 1º ticket, destaca o botão e encerra sem clicar |
