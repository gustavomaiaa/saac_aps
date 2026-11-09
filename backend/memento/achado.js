// memento/achado.js — padrão Memento aplicado ao histórico/desfazer de Achados (Sprint V)
//
//   Achado (Originator)        -> dono do estado (campo privado #estado); cria e restaura mementos.
//   AchadoMemento (Memento)    -> cópia congelada do estado, guardada em um WeakMap PRIVADO do módulo.
//                                 Quem recebe um memento só enxerga `rotulo` e `criadoEm`.
//   HistoricoAchado (Caretaker)-> guarda os mementos (pilha) e NUNCA lê o estado.
//
// O servidor não mantém memória entre requisições, então os mementos são persistidos na tabela
// achados_historico. As funções de `persistencia` (mesmo módulo, portanto com acesso ao WeakMap)
// gravam/reconstroem os mementos sem nunca devolver o estado a quem chama.

// Campos do achado que fazem parte do estado salvo/restaurado
const CAMPOS = ['titulo', 'descricao', 'severidade', 'status', 'orgao_id', 'recomendacao'];

// WeakMap privado do módulo (NÃO exportado): memento -> estado congelado
const estados = new WeakMap();

function copiarCampos(origem) {
  const copia = {};
  CAMPOS.forEach((campo) => { copia[campo] = origem[campo] === undefined ? null : origem[campo]; });
  return copia;
}

class AchadoMemento {
  #rotulo;
  #criadoEm;

  constructor(rotulo, estado, criadoEm) {
    this.#rotulo = String(rotulo);
    this.#criadoEm = criadoEm || new Date().toISOString();
    estados.set(this, Object.freeze(copiarCampos(estado))); // cópia congelada
    Object.freeze(this);
  }

  get rotulo() { return this.#rotulo; }
  get criadoEm() { return this.#criadoEm; }
}

class Achado {
  #estado;

  constructor(estadoInicial) {
    this.#estado = copiarCampos(estadoInicial);
  }

  // Altera apenas campos conhecidos do achado
  editar(campos) {
    Object.keys(campos || {}).forEach((campo) => {
      if (CAMPOS.includes(campo)) this.#estado[campo] = campos[campo];
    });
  }

  salvar(rotulo) {
    return new AchadoMemento(rotulo, this.#estado);
  }

  restaurar(memento) {
    const congelado = estados.get(memento);
    if (!congelado) throw new TypeError('Memento inválido.');
    this.#estado = { ...congelado }; // cópia descongelada: o memento original continua intocável
  }

  // Cópia do estado atual (alterar a cópia não afeta o achado)
  resumo() {
    return { ...this.#estado };
  }
}

class HistoricoAchado {
  #achado;
  #mementos;

  constructor(achado, mementosIniciais = []) {
    this.#achado = achado;
    this.#mementos = [...mementosIniciais];
  }

  registrar(rotulo) {
    const memento = this.#achado.salvar(rotulo);
    this.#mementos.push(memento);
    return memento;
  }

  // Restaura o último memento (pilha). Retorna false se não há nada a desfazer.
  desfazer() {
    if (this.#mementos.length === 0) return false;
    this.#achado.restaurar(this.#mementos.pop());
    return true;
  }

  // Somente rótulo e data — nunca o estado
  listar() {
    return this.#mementos.map((m) => ({ rotulo: m.rotulo, criadoEm: m.criadoEm }));
  }
}

// --- Persistência (usa o WeakMap interno; não devolve estado a quem chama) ---
const persistencia = {
  // Grava o memento em achados_historico
  gravar(db, achadoId, usuarioId, memento) {
    const estado = estados.get(memento);
    if (!estado) throw new TypeError('Memento inválido.');
    db.prepare(
      'INSERT INTO achados_historico (achado_id, rotulo, estado_json, criado_em, usuario_id) VALUES (?, ?, ?, ?, ?)'
    ).run(achadoId, memento.rotulo, JSON.stringify(estado), memento.criadoEm, usuarioId);
  },

  // Reconstrói o Caretaker a partir da tabela (mais antigo -> mais recente)
  carregar(db, achadoId, achado) {
    const linhas = db.prepare('SELECT id, rotulo, estado_json, criado_em FROM achados_historico WHERE achado_id = ? ORDER BY id ASC').all(achadoId);
    const mementos = linhas.map((l) => new AchadoMemento(l.rotulo, JSON.parse(l.estado_json), l.criado_em));
    return new HistoricoAchado(achado, mementos);
  },

  // Remove do banco o memento mais recente (o mesmo que desfazer() retira da pilha)
  removerUltimo(db, achadoId) {
    db.prepare('DELETE FROM achados_historico WHERE id = (SELECT MAX(id) FROM achados_historico WHERE achado_id = ?)').run(achadoId);
  },
};

module.exports = { Achado, AchadoMemento, HistoricoAchado, persistencia, CAMPOS };
