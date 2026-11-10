// services/dominio.js — valores permitidos do domínio (fonte única, usada por validação e rotas)
const SEVERIDADES = ['Crítico', 'Alto', 'Médio', 'Baixo'];
const STATUS = ['Em aberto', 'Em análise', 'Implementado', 'Rejeitado'];
const TIPOS_ORGAO = ['Prefeitura', 'Secretaria', 'Autarquia', 'Câmara Municipal', 'Fundação'];
const AREAS = ['Educação', 'Saúde', 'Obras', 'Finanças', 'Administração', 'Compliance', 'Outra'];

module.exports = { SEVERIDADES, STATUS, TIPOS_ORGAO, AREAS };
