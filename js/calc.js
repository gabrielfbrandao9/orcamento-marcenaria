/*
 * Cálculo do orçamento.
 *
 *   materiais   = soma dos materiais de todos os móveis (× quantidade de cada móvel)
 *   mão de obra = materiais × % de mão de obra
 *   margem      = (materiais + mão de obra) × % de margem de lucro
 *   total       = materiais + mão de obra + margem + frete + instalação
 *   à vista     = total − % de desconto
 *   parcelado   = total dividido em até N parcelas (com juros ao mês, se houver)
 *
 * Cada valor é arredondado em centavos, para a soma do PDF bater com o total.
 */
(function (global) {
  'use strict';

  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const pos = (n) => Math.max(0, Number(n) || 0);

  function itemTotal(it) {
    return r2(pos(it.qtd) * pos(it.preco));
  }

  function movel(m) {
    const qtd = Math.max(1, Math.round(Number(m.qtd) || 1));
    const unit = r2((m.itens || []).reduce((s, it) => s + itemTotal(it), 0));
    return { qtd, unit, total: r2(unit * qtd) };
  }

  // Valor de cada parcela no sistema Price (parcelas iguais com juros compostos).
  function parcela(valor, n, jurosPct) {
    const i = pos(jurosPct) / 100;
    if (!i) return r2(valor / n);
    return r2((valor * i) / (1 - Math.pow(1 + i, -n)));
  }

  function quote(q) {
    const moveis = (q.moveis || []).map(movel);
    const materiais = r2(moveis.reduce((s, m) => s + m.total, 0));
    const maoDeObra = r2(materiais * pos(q.maoDeObraPct) / 100);
    const margem = r2((materiais + maoDeObra) * pos(q.margemPct) / 100);
    const frete = r2(pos(q.frete));
    const instalacao = r2(pos(q.instalacao));
    const total = r2(materiais + maoDeObra + margem + frete + instalacao);
    const descontoPct = Math.min(100, pos(q.descontoVistaPct));
    const desconto = r2(total * descontoPct / 100);
    const vista = r2(total - desconto);
    const parcelas = Math.max(1, Math.round(pos(q.parcelasMax) || 1));
    const jurosPct = pos(q.jurosPct);
    const valorParcela = parcela(total, parcelas, jurosPct);
    return {
      moveis, materiais, maoDeObra, margem, frete, instalacao, total,
      descontoPct, desconto, vista,
      parcelas, jurosPct, valorParcela, totalParcelado: r2(valorParcela * parcelas),
    };
  }

  global.Calc = { r2, itemTotal, movel, quote };
})(window);
