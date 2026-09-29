# Pontos de ancoragem na rede FTTH

## Objetivo
Permitir desenhar o trajeto real de cada cabo no mapa, adicionando pontos intermediários para acompanhar postes, esquinas e curvas.

## Implementação
- Adicionar ao cabo de cada CEO/CTO uma lista de pontos intermediários, mantendo o início na caixa de origem e o fim na caixa selecionada.
- Incluir o modo **Adicionar ancoragem** ao editar uma caixa ligada: cada clique no mapa acrescenta um ponto ao cabo.
- Exibir cada ancoragem como um pequeno marcador arrastável para ajuste fino.
- Permitir selecionar e excluir pontos individualmente e limpar todo o trajeto do cabo.
- Desenhar a linha passando pelas ancoragens na ordem criada.
- Usar o comprimento real do trajeto desenhado no cálculo de sinal quando a metragem manual estiver vazia.
- Manter compatibilidade com cabos atuais: sem ancoragens, a linha continua reta entre as caixas.
- Ajustar os comandos para celular e computador e validar criação, movimentação, exclusão e recálculo do sinal.

## Detalhes técnicos
- Persistir as coordenadas intermediárias junto ao trecho de cabo, isoladas por conta pelas regras atuais da rede.
- Reutilizar o mapa e o cálculo FTTH existentes, somando a distância de todos os segmentos do trajeto.
