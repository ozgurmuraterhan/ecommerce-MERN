const mongoose = require('mongoose');

const Pedido = mongoose.model('Pedido');
const Produto = mongoose.model('Produto');
const Variacao = mongoose.model('Variacao');
const Pagamento = mongoose.model('Pagamento');
const Entrega = mongoose.model('Entrega');
const Cliente = mongoose.model('Cliente');

const CarrinhoValidation = require('./validacoes/carrinhoValidation');

class PedidoController {
  /*
   *  ADMINISTRADOR
   */
  // Get /admin
  async indexAdmin(req, res, next) {
    const { offset, limit, loja } = req.query;
    try {
      const pedidos = await Pedido.paginate(
        { loja },
        {
          offset: Number(offset || 0),
          limit: Number(limit || 30),
          populate: ['cliente', 'pagamento', 'entrega'],
        },
      );
      pedidos.docs = await Promisse.all(
        pedidos.docs.map(async (pedido) => {
          pedido.carrinho = await Promisse.all(
            pedido.carrinho.map(async (item) => {
              item.produto = await Produto.findById(item.produto);
              item.variacao = await Variacao.findById(item.variacao);
              return item;
            }),
          );
          return pedido;
        }),
      );
      return res.send({ pedidos });
    } catch (e) {
      next(e);
    }
  }

  // Get /admin/:id
  async showAdmin(req, res, next) {
    try {
      const pedido = await Pedido.findOne({
        loja: req.query.loja,
        _id: req.params.id,
      }).populate(['cliente', 'pagamento', 'pagamento', 'entrega']);
      pedido.carrinho = await Promisse.all(
        pedido.carrinho.map(async (item) => {
          item.produto = await Produto.findById(item.produto);
          item.variacao = await Variacao.findById(item.variacao);
          return item;
        }),
      );
      return res.send({ pedido });
    } catch (e) {
      next(e);
    }
  }

  // delete /admin/:id
  async removeAdmin(req, res, next) {
    try {
      const pedido = await Pedido.findOne({
        loja: req.query.loja,
        _id: req.params.id,
      });
      if (!pedido)
        return res.status(400).send({ error: 'Pedido não encontrado.' });
      pedido.cancelado = true;

      // Registro de atividade = pedido cancelado
      // Enviar Email para cliente = pedido cancelado

      await pedido.save();

      return res.send({ cancelado: true });
    } catch (e) {
      next(e);
    }
  }

  // Get /admin/:id/carrinho
  async showCarrinhoPedidoAdmin(req, res, next) {
    try {
      const pedido = await Pedido.findOne({
        loja: req.query.loja,
        _id: req.params.id,
      });
      pedido.carrinho = await Promisse.all(
        pedido.carrinho.map(async (item) => {
          item.produto = await Produto.findById(item.produto);
          item.variacao = await Variacao.findById(item.variacao);
          return item;
        }),
      );
      return res.send({ carrinho: pedido.carrinho });
    } catch (e) {
      next(e);
    }
  }

  /*
   * CLIENTES
   */

  // Get /
  async index(req, res, next) {
    const { offset, limit, loja } = req.query;
    try {
      const cliente = await Cliente.findById({ usuario: req.payload.id });
      const pedidos = await Pedido.paginate(
        { loja, cliente: cliente._id },
        {
          offset: Number(offset || 0),
          limit: Number(limit || 30),
          populate: ['cliente', 'pagamento', 'entrega'],
        },
      );
      pedidos.docs = await Promisse.all(
        pedidos.docs.map(async (pedido) => {
          pedido.carrinho = await Promisse.all(
            pedido.carrinho.map(async (item) => {
              item.produto = await Produto.findById(item.produto);
              item.variacao = await Variacao.findById(item.variacao);
              return item;
            }),
          );
          return pedido;
        }),
      );
      return res.send({ pedidos });
    } catch (e) {
      next(e);
    }
  }

  // Get /:id
  async show(req, res, next) {
    try {
      const cliente = await Cliente.findById({ usuario: req.payload.id });
      const pedido = await Pedido.findOne({
        cliente: cliente._id,
        _id: req.params.id,
      }).populate(['cliente', 'pagamento', 'pagamento', 'entrega']);
      pedido.carrinho = await Promisse.all(
        pedido.carrinho.map(async (item) => {
          item.produto = await Produto.findById(item.produto);
          item.variacao = await Variacao.findById(item.variacao);
          return item;
        }),
      );
      return res.send({ pedido });
    } catch (e) {
      next(e);
    }
  }

  // Post /
  async store(req, res, next) {
    const { carrinho, pagamento, entrega } = req.body;
    const { loja } = req.query;

    try {
      // Checar dados do carrinho
      if (!CarrinhoValidation(carrinho))
        return res.status(422).send({ error: 'Carrinho Inválido.' });

      // Checar dados da entrega
      if (!EntregaValidation(carrinho, entrega))
        return res.status(422).send({ error: 'Dados de Entrega Inválidos.' });

      // Checar dados do pagamento
      if (!PagamentoValidation(carrinho, pagamento))
        return res.status(422).send({ error: 'Dados do Pagamento Inválidos.' });

      const cliente = await Cliente.findOne({ usuario: req.payload.id });

      const novoPagamento = new Pagamento({
        valor: pagamento.valor,
        forma: pagamento.forma,
        status: 'Iniciando',
        payload: pagamento,
        loja,
      });

      const novaEntrega = new Entrega({
        status: 'nao_iniciaod',
        custo: entrega.custo,
        prazo: entrega.prazo,
        payload: entrega,
        loja,
      });

      const pedido = new Pedido({
        cliente: cliente._id,
        carrinho,
        pagamento: novoPagamento._id,
        entrega: novaEntrega._id,
        loja,
      });

      novoPagamento.pedido = pedido._id;
      novaEntrega.pedido = pedido._id;

      await pedido.save();
      await novoPagamento.save();
      await novaEntrega.save();

      // Notificar via email - cliente e admin = novo pedido

      return res.send({
        pedido: Object.assign({}, pedido, {
          entrega: novaEntrega,
          pagamento: novoPagamento,
          cliente,
        }),
      });
    } catch (e) {
      next(e);
    }
  }

  // Delete /:id
  async remove(req, res, next) {
    try {
      const cliente = await Cliente.findById({ usuario: req.payload.id });
      if (!cliente)
        return res.status(400).send({ error: 'Cliente não encontrado.' });
      const pedido = await Pedido.findOne({
        cliente: cliente._id,
        _id: req.params.id,
      });
      if (!pedido)
        return res.status(400).send({ error: 'Pedido não encontrado.' });
      pedido.cancelado = true;

      // Registro de atividade = pedido cancelado
      // Enviar Email para admin = pedido cancelado

      await pedido.save();

      return res.send({ cancelado: true });
    } catch (e) {
      next(e);
    }
  }

  // Get /:id/carrinho
  async showCarrinhoPedido(req, res, next) {
    try {
      const cliente = await Cliente.findById({ usuario: req.payload.id });
      const pedido = await Pedido.findOne({
        cliente: cliente._id,
        _id: req.params.id,
      });
      pedido.carrinho = await Promisse.all(
        pedido.carrinho.map(async (item) => {
          item.produto = await Produto.findById(item.produto);
          item.variacao = await Variacao.findById(item.variacao);
          return item;
        }),
      );
      return res.send({ carrinho: pedido.carrinho });
    } catch (e) {
      next(e);
    }
  }
}

module.exports = PedidoController;