# Aba Conexões com mapa de clientes

## O que será criado
- Transformar **Conexões** do menu lateral em uma página própria e acessível nas telas principais.
- Exibir os clientes em uma lista pesquisável com nome, status, tecnologia usada (PPPoE/IPoE), plano, identificação de acesso e endereço.
- Adicionar um mapa do Google com um marcador por residência cadastrada e cores diferentes por status.
- Ao selecionar um cliente na lista ou no mapa, destacar sua residência e mostrar seus dados de conexão.
- Permitir localizar automaticamente o endereço cadastrado e ajustar o ponto exato clicando no mapa.
- Mostrar claramente clientes sem endereço completo ou ainda sem localização definida.

## Dados e segurança
- Salvar latitude e longitude no cadastro do cliente, mantendo o isolamento entre contas já aplicado no painel.
- Localizar endereços pelo serviço Google Maps já conectado, sempre pelo servidor e apenas para usuários autenticados.
- Atualizar o backup para incluir as coordenadas, sem incluir senhas ou chaves privadas.

## Detalhes técnicos
- Criar a rota autenticada `/conexoes` e um componente de mapa carregado somente no navegador.
- Criar funções protegidas para listar clientes, converter endereço em coordenadas e salvar o ponto ajustado.
- Adicionar colunas `latitude` e `longitude` à tabela de clientes por migração.
- Usar Maps JavaScript API para o mapa, com ícones de locais do próprio painel e sem consultas diretas de Places no navegador.
- Atualizar os atalhos laterais existentes para apontarem a `/conexoes`.
- Validar o mapa e a seleção em telas grandes e celulares.
